import type { ParcelGeometry } from '../types/api';

/** [lat, lon] */
export type LatLon = [number, number];

interface Xy {
  x: number;
  y: number;
}

/** Outer rings of a (Multi)Polygon as [lon, lat] arrays */
export function outerRings(geometry: ParcelGeometry): number[][][] {
  if (geometry.type === 'Polygon') return geometry.coordinates.length > 0 ? [geometry.coordinates[0]] : [];
  return geometry.coordinates.map((poly) => poly[0]).filter(Boolean);
}

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function bboxOf(geometry: ParcelGeometry): Bbox {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const ring of outerRings(geometry)) {
    for (const [lon, lat] of ring) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
    }
  }
  return { south, west, north, east };
}

/** Local equirectangular projection in metres around an origin — accurate enough at parcel scale */
export class LocalProjection {
  private readonly lat0: number;
  private readonly lon0: number;
  private readonly kx: number;
  private readonly ky = 110_540;

  constructor(lat0: number, lon0: number) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  }

  static forBbox(b: Bbox): LocalProjection {
    return new LocalProjection((b.south + b.north) / 2, (b.west + b.east) / 2);
  }

  toXy(lat: number, lon: number): Xy {
    return { x: (lon - this.lon0) * this.kx, y: (lat - this.lat0) * this.ky };
  }

  toLatLon(p: Xy): LatLon {
    return [this.lat0 + p.y / this.ky, this.lon0 + p.x / this.kx];
  }
}

function pointInRingXy(p: Xy, ring: Xy[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(lat: number, lon: number, geometry: ParcelGeometry): boolean {
  return outerRings(geometry).some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/** Regular grid of points inside the parcel (used for labels and runoff arrows) */
export function interiorGrid(geometry: ParcelGeometry, steps: number): LatLon[] {
  const b = bboxOf(geometry);
  const out: LatLon[] = [];
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const lat = b.south + ((b.north - b.south) * i) / steps;
      const lon = b.west + ((b.east - b.west) * j) / steps;
      if (pointInGeometry(lat, lon, geometry)) out.push([lat, lon]);
    }
  }
  return out;
}

/** Area-weighted centroid of the largest ring; falls back to the nearest interior point for concave shapes */
export function labelPoint(geometry: ParcelGeometry): LatLon {
  const rings = outerRings(geometry);
  const b = bboxOf(geometry);
  const proj = LocalProjection.forBbox(b);
  let best: { area: number; c: Xy } | null = null;
  for (const ring of rings) {
    const pts = ring.map(([lon, lat]) => proj.toXy(lat, lon));
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
      a += f;
      cx += (pts[j].x + pts[i].x) * f;
      cy += (pts[j].y + pts[i].y) * f;
    }
    if (Math.abs(a) < 1e-9) continue;
    const c = { x: cx / (3 * a), y: cy / (3 * a) };
    if (!best || Math.abs(a) > best.area) best = { area: Math.abs(a), c };
  }
  const centroid: LatLon = best ? proj.toLatLon(best.c) : [(b.south + b.north) / 2, (b.west + b.east) / 2];
  if (pointInGeometry(centroid[0], centroid[1], geometry)) return centroid;
  const grid = interiorGrid(geometry, 8);
  if (grid.length === 0) return centroid;
  const cxy = proj.toXy(centroid[0], centroid[1]);
  return grid.reduce((acc, p) => {
    const d = dist(proj.toXy(p[0], p[1]), cxy);
    return d < acc.d ? { d, p } : acc;
  }, { d: Infinity, p: grid[0] }).p;
}

function dist(a: Xy, b: Xy): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function closestOnSegment(p: Xy, a: Xy, b: Xy): Xy {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Intersection point of segments ab and cd, or null */
function segmentIntersection(a: Xy, b: Xy, c: Xy, d: Xy): Xy | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

export interface NearestLink {
  distM: number;
  parcelPoint: LatLon;
  linePoint: LatLon;
}

/** Shortest distance between the parcel boundary and a polyline (0 when the line enters the parcel) */
export function nearestBetween(geometry: ParcelGeometry, line: LatLon[], proj: LocalProjection): NearestLink | null {
  if (line.length === 0) return null;
  const rings = outerRings(geometry).map((r) => r.map(([lon, lat]) => proj.toXy(lat, lon)));
  const pts = line.map(([lat, lon]) => proj.toXy(lat, lon));
  let best: { d: number; parcel: Xy; water: Xy } | null = null;
  const consider = (d: number, parcel: Xy, water: Xy) => {
    if (!best || d < best.d) best = { d, parcel, water };
  };

  for (const ring of rings) {
    // a long straight ditch can cross the parcel with both of its vertices outside it
    for (let j = 0; j + 1 < pts.length; j++) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const x = segmentIntersection(pts[j], pts[j + 1], ring[i], ring[i + 1]);
        if (x) consider(0, x, x);
      }
    }
    for (const w of pts) {
      if (pointInRingXy(w, ring)) {
        consider(0, w, w);
        continue;
      }
      for (let i = 0; i + 1 < ring.length; i++) {
        const q = closestOnSegment(w, ring[i], ring[i + 1]);
        consider(dist(w, q), q, w);
      }
    }
    for (const r of ring) {
      for (let j = 0; j + 1 < pts.length; j++) {
        const q = closestOnSegment(r, pts[j], pts[j + 1]);
        consider(dist(r, q), r, q);
      }
    }
  }
  if (!best) return null;
  const found = best as { d: number; parcel: Xy; water: Xy };
  return { distM: found.d, parcelPoint: proj.toLatLon(found.parcel), linePoint: proj.toLatLon(found.water) };
}
