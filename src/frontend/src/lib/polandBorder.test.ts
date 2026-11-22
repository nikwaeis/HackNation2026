import { describe, expect, it } from 'vitest';
import { cssClipPath, pointInGeometry } from './geo';
import { POLAND_BORDER } from './polandBorder';

describe('Poland border used to clip the drought layer and the orthophoto', () => {
  it.each([
    ['Warszawa', 52.23, 21.01],
    ['Kraków', 50.06, 19.94],
    ['Gdańsk', 54.35, 18.65],
    ['Szczecin', 53.43, 14.55],
    ['Białystok', 53.13, 23.16],
    ['Zaręby Kościelne (sample report parcel)', 52.73, 22.05],
  ])('%s is inside', (_name, lat, lon) => {
    expect(pointInGeometry(lat, lon, POLAND_BORDER)).toBe(true);
  });

  it.each([
    ['Berlin', 52.52, 13.4],
    ['Kaliningrad', 54.71, 20.51],
    ['Praha', 50.09, 14.42],
    ['Vilnius', 54.69, 25.28],
    ['Lviv', 49.84, 24.03],
    ['Baltic Sea north of Łeba', 55.2, 17.6],
  ])('%s is outside', (_name, lat, lon) => {
    expect(pointInGeometry(lat, lon, POLAND_BORDER)).toBe(false);
  });
});

describe('cssClipPath', () => {
  it('projects every vertex and closes each ring', () => {
    const square = {
      type: 'Polygon' as const,
      coordinates: [[[18, 52], [19, 52], [19, 53], [18, 52]]],
    };
    const css = cssClipPath(square, (lat, lon) => ({ x: (lon - 18) * 100, y: (53 - lat) * 100 }));
    expect(css).toBe("path(evenodd, 'M0.0 100.0L100.0 100.0L100.0 0.0L0.0 100.0Z')");
  });

  it('emits one subpath per ring of a multipolygon', () => {
    const css = cssClipPath(POLAND_BORDER, () => ({ x: 0, y: 0 }));
    const rings = POLAND_BORDER.coordinates.flat().length;
    expect(css.match(/M/g)).toHaveLength(rings);
    expect(css.match(/Z/g)).toHaveLength(rings);
  });
});
