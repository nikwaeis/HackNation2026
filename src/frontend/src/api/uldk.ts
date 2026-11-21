import type { ParcelGeometry } from '../types/api';

/*
 * Parcel boundary lookup straight from ULDK GUGiK (used only to outline the parcel on the map
 * after a click / typed ID — the analysis itself still goes through POST /api/analyze).
 * Requests go through the same-origin proxy "/uldk" (vite.config.ts in dev, nginx.conf in prod).
 */

const ULDK_BASE = (import.meta.env.VITE_ULDK_URL || '/uldk').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;
/** A real parcel response is a few KB; GUGiK's rate-limit page streams endlessly, so cap the body. */
const MAX_BODY_BYTES = 2_000_000;

export interface UldkParcel {
  id: string;
  voivodeship: string | null;
  geometry: ParcelGeometry;
  areaHa: number;
}

export type UldkErrorKind = 'NOT_FOUND' | 'UNAVAILABLE';

export class UldkError extends Error {
  kind: UldkErrorKind;
  constructor(kind: UldkErrorKind) {
    super(kind);
    this.name = 'UldkError';
    this.kind = kind;
  }
}

/** Loose TERYT parcel ID check, e.g. 040101_1.0001.123/4 */
export const PARCEL_ID_PATTERN = /^\d{6}_\d\.\d{4}\.\S+$/;

/** Splits "(a),(b)" into ["a", "b"] respecting nesting. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i));
        start = -1;
      }
    }
  }
  return out;
}

function parseRing(s: string): number[][] {
  return s
    .split(',')
    .map((pt) => pt.trim().split(/\s+/).map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, y]) => {
      // ULDK returns "lon lat" for EPSG:4326; guard against a swapped axis order anyway (Poland: lon 14–24, lat 49–55)
      return x > 45 && y < 30 ? [y, x] : [x, y];
    });
}

/** Minimal WKT reader for POLYGON / MULTIPOLYGON (optionally prefixed with "SRID=4326;"). */
export function parseWktPolygon(wkt: string): ParcelGeometry | null {
  const body = wkt.replace(/^\s*SRID=\d+;/i, '').trim();
  const match = /^(MULTIPOLYGON|POLYGON)\s*(\(.*\))\s*$/is.exec(body);
  if (!match) return null;
  const [inner] = splitTopLevel(match[2]);
  if (inner === undefined) return null;

  if (match[1].toUpperCase() === 'POLYGON') {
    const rings = splitTopLevel(inner).map(parseRing).filter((r) => r.length >= 4);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  const polygons = splitTopLevel(inner)
    .map((poly) => splitTopLevel(poly).map(parseRing).filter((r) => r.length >= 4))
    .filter((p) => p.length > 0);
  return polygons.length ? { type: 'MultiPolygon', coordinates: polygons } : null;
}

/** Approximate area in hectares (local equirectangular projection — fine for a single parcel). */
export function geometryAreaHa(geometry: ParcelGeometry): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const all = polygons.flat(2);
  if (all.length === 0) return 0;
  const lat0 = (all.reduce((s, p) => s + p[1], 0) / all.length) * (Math.PI / 180);
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos(lat0);
  const ringArea = (ring: number[][]) => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      a += x1 * mPerDegLon * (y2 * mPerDegLat) - x2 * mPerDegLon * (y1 * mPerDegLat);
    }
    return Math.abs(a) / 2;
  };
  const m2 = polygons.reduce(
    (sum, rings) => sum + ringArea(rings[0]) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0),
    0,
  );
  return m2 / 10_000;
}

async function readTextCapped(res: Response): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new UldkError('UNAVAILABLE');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** ULDK body: line 1 = status ("0" ok, "-1 …" not found), line 2 = "id|voivodeship|SRID=4326;POLYGON((…))". */
function parseResponse(text: string): UldkParcel {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new UldkError('UNAVAILABLE');
  if (lines[0].startsWith('-1')) throw new UldkError('NOT_FOUND');
  if (lines[0] !== '0' || lines.length < 2) throw new UldkError('UNAVAILABLE');

  const fields = lines[1].split('|');
  const wkt = fields.find((f) => /POLYGON/i.test(f));
  const geometry = wkt ? parseWktPolygon(wkt) : null;
  if (!geometry || !fields[0]) throw new UldkError('UNAVAILABLE');

  return {
    id: fields[0].trim(),
    voivodeship: fields[1] && !/POLYGON/i.test(fields[1]) ? fields[1].trim() || null : null,
    geometry,
    areaHa: geometryAreaHa(geometry),
  };
}

async function query(params: string, signal?: AbortSignal): Promise<UldkParcel> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${ULDK_BASE}/?${params}&result=id,voivodeship,geom_wkt&srid=4326`, {
      signal: controller.signal,
      // A healthy ULDK answers directly; a redirect means GUGiK is throttling this client
      redirect: 'manual',
    });
    if (res.type === 'opaqueredirect' || !res.ok) throw new UldkError('UNAVAILABLE');
    return parseResponse(await readTextCapped(res));
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof UldkError) throw err;
    throw new UldkError('UNAVAILABLE');
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function fetchParcelByPoint(lat: number, lon: number, signal?: AbortSignal): Promise<UldkParcel> {
  return query(`request=GetParcelByXY&xy=${lon},${lat},4326`, signal);
}

export function fetchParcelById(id: string, signal?: AbortSignal): Promise<UldkParcel> {
  return query(`request=GetParcelById&id=${encodeURIComponent(id.trim())}`, signal);
}
