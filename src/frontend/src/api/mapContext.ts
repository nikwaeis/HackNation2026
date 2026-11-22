import type { ParcelGeometry } from '../types/api';
import { LocalProjection, bboxOf, nearestBetween, type Bbox, type LatLon, type NearestLink } from '../lib/geo';

/*
 * Visual map context around the highlighted parcel (purely decorative — the analysis itself is unchanged):
 *  - ditches / streams from OpenStreetMap (Overpass API, same open source the backend uses),
 *  - downslope direction from a plane fitted to elevation samples (Open-Meteo Elevation API, Copernicus DEM 90 m).
 * Both are public, key-less and CORS-enabled; failures are silent and simply hide the overlay.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const TIMEOUT_MS = 15_000;
const VIEW_TIMEOUT_MS = 30_000;
/** How far around the parcel to look for water features */
const WATER_SEARCH_M = 700;

export type WaterKind = 'ditch' | 'drain' | 'canal' | 'stream' | 'river' | 'other';

export interface WaterFeature {
  id: number;
  kind: WaterKind;
  name: string | null;
  line: LatLon[];
}

export interface WaterContext {
  features: WaterFeature[];
  nearest: (NearestLink & { feature: WaterFeature }) | null;
}

export interface RunoffContext {
  /** Compass bearing of the downslope direction, degrees clockwise from north */
  bearingDeg: number;
  /** Slope of the fitted plane, degrees */
  planeSlopeDeg: number;
}

function withTimeout(signal: AbortSignal, ms = TIMEOUT_MS): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctrl.signal,
    done: () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    },
  };
}

const waterCache = new Map<string, WaterContext>();
const runoffCache = new Map<string, RunoffContext | null>();

function cacheKey(geometry: ParcelGeometry): string {
  const b = bboxOf(geometry);
  return [b.south, b.west, b.north, b.east].map((v) => v.toFixed(5)).join(',');
}

function toKind(tag: string | undefined): WaterKind {
  switch (tag) {
    case 'ditch':
    case 'drain':
    case 'canal':
    case 'stream':
    case 'river':
      return tag;
    default:
      return 'other';
  }
}

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** Agricultural land from OSM — the areas a farmer can actually pick */
export interface FieldArea {
  id: number;
  /** outer rings as [lat, lon] */
  rings: LatLon[][];
}

export interface ViewContext {
  water: WaterFeature[];
  fields: FieldArea[];
}

const FIELD_LANDUSE = '^(farmland|meadow|orchard|vineyard|plant_nursery)$';

async function queryWaterways(box: Bbox, limit: number, signal: AbortSignal): Promise<WaterFeature[]> {
  const bbox = [box.south, box.west, box.north, box.east].map((v) => v.toFixed(6)).join(',');
  const query = `[out:json][timeout:15];way["waterway"~"^(ditch|drain|canal|stream|river)$"](${bbox});out geom ${limit};`;
  const t = withTimeout(signal);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      signal: t.signal,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = (await res.json()) as { elements?: OverpassWay[] };
    return (json.elements ?? [])
      .filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
      .map((el) => ({
        id: el.id,
        kind: toKind(el.tags?.waterway),
        name: el.tags?.name ?? null,
        line: el.geometry!.map((p) => [p.lat, p.lon] as LatLon),
      }));
  } finally {
    t.done();
  }
}

/** Grid cell (in degrees) used to snap and cache viewport queries */
const VIEW_CELL_DEG = 0.02;
const viewCache = new Map<string, ViewContext>();

function isClosed(line: { lat: number; lon: number }[]): boolean {
  if (line.length < 4) return false;
  const a = line[0];
  const b = line[line.length - 1];
  return a.lat === b.lat && a.lon === b.lon;
}

/**
 * Ditches / streams and agricultural land for the visible map area.
 * The box is snapped to a grid so small pans reuse the cached result.
 */
export async function fetchViewContext(view: Bbox, signal: AbortSignal): Promise<ViewContext> {
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v / VIEW_CELL_DEG) : Math.floor(v / VIEW_CELL_DEG)) * VIEW_CELL_DEG;
  const box: Bbox = {
    south: snap(view.south, false),
    west: snap(view.west, false),
    north: snap(view.north, true),
    east: snap(view.east, true),
  };
  const key = [box.south, box.west, box.north, box.east].map((v) => v.toFixed(3)).join(',');
  const cached = viewCache.get(key);
  if (cached) return cached;

  const bbox = [box.south, box.west, box.north, box.east].map((v) => v.toFixed(6)).join(',');
  // ways only: multipolygon relations are costly for the public server and rare for single fields
  const query = `[out:json][timeout:25];(way["waterway"~"^(ditch|drain|canal|stream|river)$"](${bbox});way["landuse"~"${FIELD_LANDUSE}"](${bbox}););out geom 6000;`;

  // the public Overpass instance can be slow under load — give the viewport query more time
  const t = withTimeout(signal, VIEW_TIMEOUT_MS);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      signal: t.signal,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = (await res.json()) as { elements?: OverpassWay[] };

    const water: WaterFeature[] = [];
    const fields: FieldArea[] = [];
    for (const el of json.elements ?? []) {
      if (el.type === 'way' && el.tags?.waterway && el.geometry && el.geometry.length >= 2) {
        water.push({
          id: el.id,
          kind: toKind(el.tags.waterway),
          name: el.tags.name ?? null,
          line: el.geometry.map((p) => [p.lat, p.lon] as LatLon),
        });
      } else if (el.type === 'way' && el.tags?.landuse && el.geometry && isClosed(el.geometry)) {
        fields.push({ id: el.id, rings: [el.geometry.map((p) => [p.lat, p.lon] as LatLon)] });
      } else if (el.type === 'relation' && el.members) {
        // multipolygon: keep the outer members that are closed rings on their own
        const rings = el.members
          .filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry && isClosed(m.geometry))
          .map((m) => m.geometry!.map((p) => [p.lat, p.lon] as LatLon));
        if (rings.length > 0) fields.push({ id: -el.id, rings });
      }
    }

    const result = { water, fields };
    viewCache.set(key, result);
    return result;
  } finally {
    t.done();
  }
}

function inRing(lat: number, lon: number, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInFields(lat: number, lon: number, fields: FieldArea[]): boolean {
  return fields.some((f) => f.rings.some((r) => inRing(lat, lon, r)));
}

export async function fetchWaterContext(geometry: ParcelGeometry, signal: AbortSignal): Promise<WaterContext> {
  const key = cacheKey(geometry);
  const cached = waterCache.get(key);
  if (cached) return cached;

  const b = bboxOf(geometry);
  const dLat = WATER_SEARCH_M / 110_540;
  const dLon = WATER_SEARCH_M / (111_320 * Math.cos((((b.south + b.north) / 2) * Math.PI) / 180));
  const features = await queryWaterways(
    { south: b.south - dLat, west: b.west - dLon, north: b.north + dLat, east: b.east + dLon },
    120,
    signal,
  );
  {
    const proj = LocalProjection.forBbox(b);
    let nearest: WaterContext['nearest'] = null;
    for (const feature of features) {
      const link = nearestBetween(geometry, feature.line, proj);
      if (link && (!nearest || link.distM < nearest.distM)) nearest = { ...link, feature };
    }

    const result = { features, nearest };
    waterCache.set(key, result);
    return result;
  }
}

/** Least-squares plane z = a + b·x + c·y through the samples */
function fitPlane(samples: { x: number; y: number; z: number }[]): { b: number; c: number } | null {
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (const s of samples) {
    n++;
    sx += s.x; sy += s.y; sz += s.z;
    sxx += s.x * s.x; syy += s.y * s.y; sxy += s.x * s.y;
    sxz += s.x * s.z; syz += s.y * s.z;
  }
  if (n < 4) return null;
  // centre the data so the 3x3 system reduces to 2x2
  const mx = sx / n, my = sy / n, mz = sz / n;
  const cxx = sxx - n * mx * mx;
  const cyy = syy - n * my * my;
  const cxy = sxy - n * mx * my;
  const cxz = sxz - n * mx * mz;
  const cyz = syz - n * my * mz;
  const det = cxx * cyy - cxy * cxy;
  if (Math.abs(det) < 1e-9) return null;
  return { b: (cxz * cyy - cyz * cxy) / det, c: (cyz * cxx - cxz * cxy) / det };
}

export async function fetchRunoffContext(geometry: ParcelGeometry, signal: AbortSignal): Promise<RunoffContext | null> {
  const key = cacheKey(geometry);
  if (runoffCache.has(key)) return runoffCache.get(key) ?? null;

  const b = bboxOf(geometry);
  const proj = LocalProjection.forBbox(b);
  const sw = proj.toXy(b.south, b.west);
  const ne = proj.toXy(b.north, b.east);
  // the DEM cell is ~90 m, so sample a window of at least ~360 m
  const half = Math.max(180, (ne.x - sw.x) / 2 * 1.2, (ne.y - sw.y) / 2 * 1.2);
  const steps = 4;
  const pts: { x: number; y: number; lat: number; lon: number }[] = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = -half + (2 * half * j) / (steps - 1);
      const y = -half + (2 * half * i) / (steps - 1);
      const [lat, lon] = proj.toLatLon({ x, y });
      pts.push({ x, y, lat, lon });
    }
  }

  const url = `${ELEVATION_URL}?latitude=${pts.map((p) => p.lat.toFixed(5)).join(',')}&longitude=${pts
    .map((p) => p.lon.toFixed(5))
    .join(',')}`;

  const t = withTimeout(signal);
  try {
    const res = await fetch(url, { signal: t.signal });
    if (!res.ok) throw new Error(`Elevation ${res.status}`);
    const json = (await res.json()) as { elevation?: number[] };
    const z = json.elevation ?? [];
    const samples = pts
      .map((p, i) => ({ x: p.x, y: p.y, z: z[i] }))
      .filter((s) => Number.isFinite(s.z));
    const plane = fitPlane(samples);
    let result: RunoffContext | null = null;
    if (plane) {
      const grad = Math.hypot(plane.b, plane.c);
      // gradient (b, c) points uphill; water runs the opposite way
      if (grad > 1e-4) {
        const bearing = (Math.atan2(-plane.b, -plane.c) * 180) / Math.PI;
        result = { bearingDeg: (bearing + 360) % 360, planeSlopeDeg: (Math.atan(grad) * 180) / Math.PI };
      }
    }
    runoffCache.set(key, result);
    return result;
  } finally {
    t.done();
  }
}
