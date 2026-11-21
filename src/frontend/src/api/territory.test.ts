import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessTerritory, classifyEgib } from './territory';
import type { FieldArea } from './mapContext';
import { HOUSE_PLOT, hangingResponse, kiegXml, routedFetch } from '../test/fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const signal = () => new AbortController().signal;

describe('classifyEgib — EGiB land-use symbols (Rozporządzenie w sprawie EGiB, zał. 6)', () => {
  it.each([
    ['RIVa', 'arable'],
    ['RIIIb', 'arable'],
    ['ŁIII', 'meadow'],
    ['PsV', 'pasture'],
    ['S-RIVa', 'orchard'],
    ['B', 'builtUp'],
    ['Bi', 'builtUp'],
    ['Ba', 'builtUp'],
    ['Br-RIVa', 'farmyard'], // built-up agricultural land: farmstead, not a field
    ['Ls', 'forest'],
    ['Lzr-ŁV', 'forest'],
    ['W', 'water'],
    ['Wsr', 'water'],
    ['dr', 'road'],
    ['Tk', 'road'],
    ['N', 'wasteland'],
  ])('%s → %s', (code, expected) => {
    expect(classifyEgib(code)).toBe(expected);
  });

  it('unknown symbols give null (no guessing)', () => {
    expect(classifyEgib('')).toBeNull();
    expect(classifyEgib('XYZ')).toBeNull();
  });
});

describe('assessTerritory', () => {
  it('queries KIEG at the exact click: WMS 1.3.0, EPSG:4326 lat/lon bbox centred on the point', async () => {
    const { fn, calls } = routedFetch([[() => true, () => new Response(kiegXml({ kontur: 'B' }))]]);
    vi.stubGlobal('fetch', fn);
    await assessTerritory(HOUSE_PLOT.click, null, signal());

    const url = new URL(calls[0].url);
    expect(url.host).toBe('integracja.gugik.gov.pl');
    expect(url.searchParams.get('REQUEST')).toBe('GetFeatureInfo');
    expect(url.searchParams.get('CRS')).toBe('EPSG:4326');
    const [s, w, n, e] = url.searchParams.get('BBOX')!.split(',').map(Number);
    expect((s + n) / 2).toBeCloseTo(HOUSE_PLOT.click.lat, 6); // lat first in WMS 1.3.0 + EPSG:4326
    expect((w + e) / 2).toBeCloseTo(HOUSE_PLOT.click.lon, 6);
    expect(url.searchParams.get('I')).toBe('50');
    expect(url.searchParams.get('J')).toBe('50');
  });

  it('house plot from the bug report (kontur B) → warning builtUp, with the register code', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({ kontur: 'B' }))]]).fn);
    expect(await assessTerritory(HOUSE_PLOT.click, null, signal())).toEqual({
      kind: 'warn',
      reason: 'builtUp',
      source: 'egib',
      code: 'B',
    });
  });

  it('arable land (RV) → field', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({ kontur: 'RV' }))]]).fn);
    expect(await assessTerritory({ lat: 53.12, lon: 19.86 }, null, signal())).toMatchObject({
      kind: 'field',
      field: 'arable',
      source: 'egib',
    });
  });

  it('falls back to "Oznaczenie użytku" when the contour is empty', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({ uzytek: 'ŁIV' }))]]).fn);
    expect(await assessTerritory({ lat: 53, lon: 19 }, null, signal())).toMatchObject({ kind: 'field', field: 'meadow' });
  });

  it('multi-contour parcel: all farm classes → field; all non-farm → most relevant warning', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({ kontur: 'RV,RVI,PsV' }))]]).fn);
    expect(await assessTerritory({ lat: 53, lon: 19 }, null, signal())).toMatchObject({ kind: 'field' });

    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({ kontur: 'Ls,W,Bi' }))]]).fn);
    expect(await assessTerritory({ lat: 53, lon: 19 }, null, signal())).toMatchObject({ kind: 'warn', reason: 'builtUp' });
  });

  it('mixed parcel (fields + buildings) is not decided from the list — falls back to OSM / unverified', async () => {
    const live = 'RV,S/RV,PsV,PsVI,Ls,LsV,LsVI,Br/RV,Lz,N,W,Bi'; // real answer for a Kampinos parcel
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({ kontur: live }))]]).fn);
    expect(await assessTerritory({ lat: 52.33, lon: 20.65 }, null, signal())).toEqual({ kind: 'unverified' });
  });

  describe('fallback to OSM farmland loaded for the visible map', () => {
    const fields: FieldArea[] = [
      { id: 1, rings: [[[52.0, 18.0], [52.0, 18.01], [52.01, 18.01], [52.01, 18.0], [52.0, 18.0]]] },
    ];

    it('county without classes + point inside OSM farmland → field (osm)', async () => {
      vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({}))]]).fn);
      expect(await assessTerritory({ lat: 52.005, lon: 18.005 }, fields, signal())).toEqual({
        kind: 'field',
        source: 'osm',
        field: 'farmland',
      });
    });

    it('county without classes + point outside OSM farmland → warning notFarmland', async () => {
      vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(kiegXml({}))]]).fn);
      expect(await assessTerritory({ lat: 52.05, lon: 18.05 }, fields, signal())).toMatchObject({
        kind: 'warn',
        reason: 'notFarmland',
      });
    });
  });

  it('KIEG hangs → gives up after 2.5 s with "unverified" (never blocks the farmer)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', routedFetch([[() => true, (_u, init) => hangingResponse(init)]]).fn);
    const pending = assessTerritory(HOUSE_PLOT.click, null, signal());
    await vi.advanceTimersByTimeAsync(2_600);
    expect(await pending).toEqual({ kind: 'unverified' });
  });

  it('KIEG error → unverified', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response('oops', { status: 503 })]]).fn);
    expect(await assessTerritory(HOUSE_PLOT.click, null, signal())).toEqual({ kind: 'unverified' });
  });

  it('a newer click aborts the check (caller signal) instead of resolving with stale data', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, (_u, init) => hangingResponse(init)]]).fn);
    const ctrl = new AbortController();
    const pending = assessTerritory(HOUSE_PLOT.click, null, ctrl.signal);
    ctrl.abort();
    await expect(pending).rejects.toThrow();
  });
});
