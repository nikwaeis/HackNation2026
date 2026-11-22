import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRunoffContext, fetchViewContext, fetchWaterContext, pointInFields } from './mapContext';
import type { ParcelGeometry } from '../types/api';
import { routedFetch } from '../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

const signal = () => new AbortController().signal;

/** Each test uses its own parcel: the module caches results per parcel bbox */
function parcelAt(lon: number, lat: number, size = 0.004): ParcelGeometry {
  return {
    type: 'Polygon',
    coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
  };
}

/** Open-Meteo Elevation API mock: z = f(lat, lon) for every requested point */
function elevationMock(z: (lat: number, lon: number) => number) {
  return routedFetch([
    [
      (u) => u.startsWith('https://api.open-meteo.com/v1/elevation'),
      (u) => {
        const q = new URL(u).searchParams;
        const lats = q.get('latitude')!.split(',').map(Number);
        const lons = q.get('longitude')!.split(',').map(Number);
        return Response.json({ elevation: lats.map((lat, i) => z(lat, lons[i])) });
      },
    ],
  ]);
}

describe('fetchRunoffContext (runoff arrows)', () => {
  it('terrain falling to the east → water runs east (bearing ≈ 90°)', async () => {
    vi.stubGlobal('fetch', elevationMock((_lat, lon) => 100 - (lon - 18) * 500).fn);
    const r = await fetchRunoffContext(parcelAt(18.1, 52.1), signal());
    expect(r!.bearingDeg).toBeCloseTo(90, 0);
    expect(r!.planeSlopeDeg).toBeGreaterThan(0);
  });

  it('terrain rising to the north → water runs south (bearing ≈ 180°)', async () => {
    vi.stubGlobal('fetch', elevationMock((lat) => 100 + (lat - 52) * 500).fn);
    const r = await fetchRunoffContext(parcelAt(18.2, 52.2), signal());
    expect(r!.bearingDeg).toBeCloseTo(180, 0);
  });

  it('perfectly flat terrain → no direction (no arrows drawn)', async () => {
    vi.stubGlobal('fetch', elevationMock(() => 87).fn);
    expect(await fetchRunoffContext(parcelAt(18.3, 52.3), signal())).toBeNull();
  });

  it('samples a window of at least ~360 m (DEM cell is ~90 m)', async () => {
    const { fn, calls } = elevationMock(() => 87);
    vi.stubGlobal('fetch', fn);
    await fetchRunoffContext(parcelAt(18.4, 52.4, 0.0005), signal()); // tiny ~35 m parcel
    const q = new URL(calls[0].url).searchParams;
    const lons = q.get('longitude')!.split(',').map(Number);
    const spanM = (Math.max(...lons) - Math.min(...lons)) * 111_320 * Math.cos((52.4 * Math.PI) / 180);
    expect(spanM).toBeGreaterThanOrEqual(350);
  });
});

const overpass = (elements: unknown[]) =>
  routedFetch([[(u) => u.includes('overpass-api.de'), () => Response.json({ elements })]]);

describe('fetchWaterContext (ditch next to the parcel)', () => {
  it('finds the nearest ditch and its distance', async () => {
    const parcel = parcelAt(19.0, 53.0);
    vi.stubGlobal(
      'fetch',
      overpass([
        // ditch 0.0015° east of the parcel edge (lon 19.004) ≈ 100 m
        { type: 'way', id: 7, tags: { waterway: 'ditch' }, geometry: [{ lat: 52.99, lon: 19.0055 }, { lat: 53.01, lon: 19.0055 }] },
        // far river
        { type: 'way', id: 8, tags: { waterway: 'river', name: 'Wisła' }, geometry: [{ lat: 52.99, lon: 19.03 }, { lat: 53.01, lon: 19.03 }] },
      ]).fn,
    );
    const ctx = await fetchWaterContext(parcel, signal());
    expect(ctx.features).toHaveLength(2);
    expect(ctx.nearest!.feature.id).toBe(7);
    expect(ctx.nearest!.feature.kind).toBe('ditch');
    expect(ctx.nearest!.distM).toBeCloseTo(0.0015 * 111_320 * Math.cos((53 * Math.PI) / 180), 0);
  });
});

describe('fetchViewContext (fields highlighted on the map + ditches)', () => {
  it('separates waterways from closed farmland ways and ignores open landuse ways', async () => {
    const closed = [{ lat: 52, lon: 18 }, { lat: 52, lon: 18.01 }, { lat: 52.01, lon: 18.01 }, { lat: 52, lon: 18 }];
    vi.stubGlobal(
      'fetch',
      overpass([
        { type: 'way', id: 1, tags: { waterway: 'ditch' }, geometry: [{ lat: 52, lon: 18 }, { lat: 52.01, lon: 18 }] },
        { type: 'way', id: 2, tags: { landuse: 'farmland' }, geometry: closed },
        { type: 'way', id: 3, tags: { landuse: 'meadow' }, geometry: closed.slice(0, 3) }, // broken ring
      ]).fn,
    );
    const ctx = await fetchViewContext({ south: 52, west: 18, north: 52.01, east: 18.01 }, signal());
    expect(ctx.water.map((w) => w.id)).toEqual([1]);
    expect(ctx.fields.map((f) => f.id)).toEqual([2]);
    expect(pointInFields(52.002, 18.006, ctx.fields)).toBe(true);
    expect(pointInFields(52.009, 18.001, ctx.fields)).toBe(false);
  });

  it('caches by snapped grid: a small pan does not query Overpass again', async () => {
    const { fn, calls } = overpass([]);
    vi.stubGlobal('fetch', fn);
    await fetchViewContext({ south: 51.501, west: 17.501, north: 51.509, east: 17.509 }, signal());
    await fetchViewContext({ south: 51.502, west: 17.502, north: 51.51, east: 17.51 }, signal());
    expect(calls).toHaveLength(1);
  });
});
