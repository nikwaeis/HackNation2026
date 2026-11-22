import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PARCEL_ID_PATTERN,
  UldkError,
  fetchParcelById,
  fetchParcelByPoint,
  geometryAreaHa,
  parseWktPolygon,
} from './uldk';
import { FIELD, HOUSE_PLOT, ULDK_NOT_FOUND, routedFetch, uldkBody } from '../test/fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('PARCEL_ID_PATTERN — jury types real TERYT parcel IDs from all over Poland', () => {
  it.each([
    '040706_5.0016.16/10', // rural gmina
    '143703_4.0001.387', // urban part of urban-rural gmina
    '146501_8.0101.10/3', // Warszawa district
    '026401_1.0001.AR_1.123/4', // with map sheet (arkusz)
    '040101_1.0001.123/4', // docs/api.md example
  ])('accepts %s', (id) => {
    expect(PARCEL_ID_PATTERN.test(id)).toBe(true);
  });

  it.each(['040101', 'abc', '04010_1.0001.1', '040101_1.001.1', ''])('rejects incomplete input %j', (id) => {
    expect(PARCEL_ID_PATTERN.test(id)).toBe(false);
  });
});

describe('parseWktPolygon', () => {
  it('parses POLYGON with SRID prefix as [lon, lat]', () => {
    const g = parseWktPolygon(`SRID=4326;${FIELD.wkt}`)!;
    expect(g.type).toBe('Polygon');
    if (g.type !== 'Polygon') return;
    expect(g.coordinates[0][0]).toEqual([18.34, 52.715]);
    expect(g.coordinates[0]).toHaveLength(5);
  });

  it('keeps holes and parses MULTIPOLYGON', () => {
    const g = parseWktPolygon(
      'MULTIPOLYGON(((18 52,18.01 52,18.01 52.01,18 52.01,18 52),(18.002 52.002,18.004 52.002,18.004 52.004,18.002 52.004,18.002 52.002)),((19 53,19.01 53,19.01 53.01,19 53)))',
    )!;
    expect(g.type).toBe('MultiPolygon');
    if (g.type !== 'MultiPolygon') return;
    expect(g.coordinates).toHaveLength(2);
    expect(g.coordinates[0]).toHaveLength(2); // outer + hole
  });

  it('fixes a swapped (lat lon) axis order', () => {
    const g = parseWktPolygon('POLYGON((52.715 18.34,52.715 18.35,52.721 18.35,52.715 18.34))')!;
    if (g.type !== 'Polygon') throw new Error('expected Polygon');
    expect(g.coordinates[0][0]).toEqual([18.34, 52.715]);
  });

  it('returns null for garbage', () => {
    expect(parseWktPolygon('POINT(18 52)')).toBeNull();
    expect(parseWktPolygon('<html>rate limited</html>')).toBeNull();
  });
});

describe('geometryAreaHa', () => {
  it('matches a hand-computed rectangle area', () => {
    // fixture = bounding rectangle of the house plot (the parcel itself is 0.0804 ha in EGiB):
    // width  0.0004666° lon × 111 320 m × cos(53.1192°) ≈ 31.15 m
    // height 0.0003940° lat × 111 320 m              ≈ 43.86 m  → ≈ 1366 m² = 0.1366 ha
    const area = geometryAreaHa(parseWktPolygon(HOUSE_PLOT.wkt)!);
    expect(area).toBeCloseTo(0.1366, 3);
  });

  it('subtracts holes', () => {
    const full = geometryAreaHa(parseWktPolygon('POLYGON((18 52,18.01 52,18.01 52.01,18 52.01,18 52))')!);
    const holed = geometryAreaHa(
      parseWktPolygon(
        'POLYGON((18 52,18.01 52,18.01 52.01,18 52.01,18 52),(18.002 52.002,18.004 52.002,18.004 52.004,18.002 52.004,18.002 52.002))',
      )!,
    );
    expect(holed / full).toBeCloseTo(0.96, 2);
  });
});

describe('ULDK requests', () => {
  it('GetParcelByXY sends the exact click as lon,lat,4326 and parses the parcel', async () => {
    const { fn, calls } = routedFetch([
      [
        (u) => u.includes('GetParcelByXY'),
        () => new Response(uldkBody(HOUSE_PLOT.id, HOUSE_PLOT.voivodeship, HOUSE_PLOT.wkt)),
      ],
    ]);
    vi.stubGlobal('fetch', fn);

    const parcel = await fetchParcelByPoint(HOUSE_PLOT.click.lat, HOUSE_PLOT.click.lon);

    const url = new URL(calls[0].url, 'http://localhost');
    expect(url.searchParams.get('xy')).toBe('19.84957,53.11922,4326'); // x = lon first
    expect(url.searchParams.get('srid')).toBe('4326');
    expect(url.searchParams.get('result')).toBe('id,voivodeship,geom_wkt');
    expect(parcel.id).toBe('143703_4.0001.387');
    expect(parcel.voivodeship).toBe('mazowieckie');
    expect(parcel.geometry.type).toBe('Polygon');
    expect(parcel.areaHa).toBeGreaterThan(0.05);
  });

  it('GetParcelById URL-encodes the slash in the parcel number and trims spaces', async () => {
    const { fn, calls } = routedFetch([[() => true, () => new Response(uldkBody(FIELD.id, FIELD.voivodeship, FIELD.wkt))]]);
    vi.stubGlobal('fetch', fn);
    await fetchParcelById('  040706_5.0016.16/10 ');
    expect(calls[0].url).toContain('id=040706_5.0016.16%2F10&');
  });

  it('"-1" (outside Poland / water / road) is NOT_FOUND', async () => {
    vi.stubGlobal('fetch', routedFetch([[() => true, () => new Response(ULDK_NOT_FOUND)]]).fn);
    await expect(fetchParcelByPoint(55.5, 15.0)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  });

  it.each([
    ['HTTP 500', () => new Response('err', { status: 500 })],
    ['HTML rate-limit page', () => new Response('<html>Too many requests</html>')],
    ['network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('%s is UNAVAILABLE (never crashes the form)', async (_name, respond) => {
    vi.stubGlobal('fetch', routedFetch([[() => true, respond]]).fn);
    const err = await fetchParcelByPoint(52, 18).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UldkError);
    expect((err as UldkError).kind).toBe('UNAVAILABLE');
  });
});
