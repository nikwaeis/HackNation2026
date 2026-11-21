import type { ParcelGeometry } from '../types/api';

export interface UldkResolvedParcel {
  dzialkaId: string;
  voivodeship: string | null;
  commune: string | null;
  geometry: ParcelGeometry;
}

const ULDK_BASE = 'https://uldk.gugik.gov.pl/';
const RESULT_FIELDS = 'id,voivodeship,commune,geom_wkt';

function parseRing(ringText: string): number[][] {
  return ringText
    .split(',')
    .map((pair) => {
      const parts = pair.trim().split(/\s+/);
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      return [lon, lat];
    })
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function parsePolygonBody(body: string): number[][][] {
  // Split "(outer),(hole1),(hole2)" into rings
  const rings: number[][][] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0 && start >= 0) {
        const ring = parseRing(body.slice(start, i));
        if (ring.length >= 4) rings.push(ring);
        start = -1;
      }
    }
  }
  return rings;
}

export function parseWktGeometry(rawWkt: string): ParcelGeometry | null {
  const cleaned = rawWkt.includes(';') ? rawWkt.slice(rawWkt.indexOf(';') + 1).trim() : rawWkt.trim();
  const upper = cleaned.toUpperCase();

  if (upper.startsWith('POLYGON')) {
    const firstParen = cleaned.indexOf('(');
    const lastParen = cleaned.lastIndexOf(')');
    if (firstParen < 0 || lastParen <= firstParen) return null;
    const rings = parsePolygonBody(cleaned.slice(firstParen + 1, lastParen));
    if (rings.length === 0) return null;
    return { type: 'Polygon', coordinates: rings };
  }

  if (upper.startsWith('MULTIPOLYGON')) {
    const firstParen = cleaned.indexOf('(');
    const lastParen = cleaned.lastIndexOf(')');
    if (firstParen < 0 || lastParen <= firstParen) return null;
    const inner = cleaned.slice(firstParen + 1, lastParen);
    const polygons: number[][][][] = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === '(') {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0 && start >= 0) {
          const rings = parsePolygonBody(inner.slice(start, i));
          if (rings.length > 0) polygons.push(rings);
          start = -1;
        }
      }
    }
    if (polygons.length === 0) return null;
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  return null;
}

function parseUldkResponse(body: string): UldkResolvedParcel | null {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2 || lines[0] !== '0') {
    return null;
  }

  const fields = lines[1].split('|');
  if (fields.length < 4) return null;

  const dzialkaId = fields[0].trim();
  const voivodeship = fields[1].trim() || null;
  const commune = fields[2].trim() || null;
  const geometry = parseWktGeometry(fields[3]);

  if (!dzialkaId || !geometry) return null;
  return { dzialkaId, voivodeship, commune, geometry };
}

async function queryUldk(query: string, signal?: AbortSignal): Promise<UldkResolvedParcel | null> {
  const res = await fetch(`${ULDK_BASE}${query}`, { signal });
  if (!res.ok) {
    throw new Error(`ULDK HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseUldkResponse(text);
}

export async function lookupParcelByPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<UldkResolvedParcel | null> {
  const query = `?request=GetParcelByXY&xy=${lon},${lat},4326&result=${RESULT_FIELDS}&srid=4326`;
  return queryUldk(query, signal);
}

export async function lookupParcelById(
  dzialkaId: string,
  signal?: AbortSignal,
): Promise<UldkResolvedParcel | null> {
  const query = `?request=GetParcelById&id=${encodeURIComponent(dzialkaId.trim())}&result=${RESULT_FIELDS}&srid=4326`;
  return queryUldk(query, signal);
}
