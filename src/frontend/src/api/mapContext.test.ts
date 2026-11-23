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

  it('caches by snapped grid: a small pan does not ask again', async () => {
    const { fn, calls } = overpass([]);
    vi.stubGlobal('fetch', fn);
    await fetchViewContext({ south: 51.501, west: 17.501, north: 51.509, east: 17.509 }, signal());
    await fetchViewContext({ south: 51.502, west: 17.502, north: 51.51, east: 17.51 }, signal());
    // first the backend (not running in this test), then Overpass once
    expect(calls.map((c) => new URL(c.url, 'http://app.local').pathname)).toEqual(['/api/map/context', '/api/interpreter']);
  });
});

/** Backend `GET /api/map/context` plus Overpass mocks; Overpass answers with the given elements */
function mapApi(body: unknown, overpassElements: unknown[] = [], status = 200) {
  return routedFetch([
    [(u) => u.startsWith('/api/map/context'), () => Response.json(body, { status })],
    [(u) => u.includes('overpass-api.de'), () => Response.json({ elements: overpassElements })],
  ]);
}

const overpassQuery = (init?: RequestInit) => new URLSearchParams(String(init?.body)).get('data') ?? '';

describe('ditches from the backend OSM import, farmland from Overpass', () => {
  const closed = [{ lat: 50, lon: 20 }, { lat: 50, lon: 20.01 }, { lat: 50.01, lon: 20.01 }, { lat: 50, lon: 20 }];

  it('takes ditches from the backend and asks Overpass for farmland only', async () => {
    const { fn, calls } = mapApi(
      { water: [{ id: 5, kind: 'stream', name: 'Struga', line: [[50, 20], [50.01, 20]] }], waterSource: 'osm-import' },
      [
        { type: 'way', id: 6, tags: { landuse: 'farmland' }, geometry: closed },
        { type: 'way', id: 7, tags: { waterway: 'ditch' }, geometry: [{ lat: 50, lon: 20 }, { lat: 50.01, lon: 20 }] },
      ],
    );
    vi.stubGlobal('fetch', fn);

    const ctx = await fetchViewContext({ south: 50.001, west: 20.001, north: 50.009, east: 20.009 }, signal());

    expect(ctx.water).toEqual([{ id: 5, kind: 'stream', name: 'Struga', line: [[50, 20], [50.01, 20]] }]);
    expect(ctx.fields.map((f) => f.id)).toEqual([6]);
    const q = new URL(calls[0].url, 'http://app.local').searchParams;
    expect([q.get('south'), q.get('west'), q.get('north'), q.get('east')]).toEqual(['50.00000', '20.00000', '50.02000', '20.02000']);
    expect(overpassQuery(calls[1].init)).toContain('landuse');
    expect(overpassQuery(calls[1].init)).not.toContain('waterway');
  });

  it('hands the ditches over before farmland, and keeps them when Overpass fails', async () => {
    const { fn } = routedFetch([
      [(u) => u.startsWith('/api/map/context'), () => Response.json({ water: [{ id: 11, kind: 'ditch', name: null, line: [[50.3, 20.3], [50.31, 20.3]] }], waterSource: 'osm-import' })],
      [(u) => u.includes('overpass-api.de'), () => new Response('busy', { status: 504 })],
    ]);
    vi.stubGlobal('fetch', fn);
    const early: number[] = [];

    await expect(
      fetchViewContext({ south: 50.301, west: 20.301, north: 50.309, east: 20.309 }, signal(), (w) => early.push(...w.map((x) => x.id))),
    ).rejects.toThrow();
    expect(early).toEqual([11]);
  });

  it('without an import the browser asks Overpass for waterways too', async () => {
    const { fn, calls } = mapApi({ water: [], waterSource: null }, [
      { type: 'way', id: 8, tags: { waterway: 'ditch' }, geometry: [{ lat: 50.1, lon: 20.1 }, { lat: 50.11, lon: 20.1 }] },
    ]);
    vi.stubGlobal('fetch', fn);

    const ctx = await fetchViewContext({ south: 50.101, west: 20.101, north: 50.109, east: 20.109 }, signal());

    expect(ctx.water.map((w) => w.id)).toEqual([8]);
    expect(overpassQuery(calls[1].init)).toContain('waterway');
  });

  it('rate limits are not bypassed by asking Overpass directly', async () => {
    const { fn, calls } = mapApi({ title: 'Too many requests' }, [], 429);
    vi.stubGlobal('fetch', fn);
    await expect(fetchViewContext({ south: 50.201, west: 20.201, north: 50.209, east: 20.209 }, signal())).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('water around a parcel comes from the import alone and measures the nearest ditch', async () => {
    const { fn, calls } = mapApi({
      water: [{ id: 9, kind: 'ditch', name: null, line: [[49.99, 21.0055], [50.01, 21.0055]] }],
      waterSource: 'osm-import',
    });
    vi.stubGlobal('fetch', fn);

    const ctx = await fetchWaterContext(parcelAt(21.0, 50.0), signal());

    expect(ctx.nearest!.feature.id).toBe(9);
    expect(calls).toHaveLength(1); // no Overpass request
  });

  it('water around a parcel falls back to Overpass before the import has run', async () => {
    const { fn, calls } = mapApi({ water: [], waterSource: null }, [
      { type: 'way', id: 10, tags: { waterway: 'drain' }, geometry: [{ lat: 50.09, lon: 21.1055 }, { lat: 50.11, lon: 21.1055 }] },
    ]);
    vi.stubGlobal('fetch', fn);

    const ctx = await fetchWaterContext(parcelAt(21.1, 50.1), signal());

    expect(ctx.nearest!.feature.id).toBe(10);
    expect(calls.map((c) => c.url.includes('overpass-api.de'))).toEqual([false, true]);
  });
});
