import { describe, expect, it } from 'vitest';
import { LocalProjection, bboxOf, interiorGrid, labelPoint, nearestBetween, pointInGeometry } from './geo';
import type { ParcelGeometry } from '../types/api';

const square: ParcelGeometry = {
  type: 'Polygon',
  coordinates: [[[18.0, 52.0], [18.01, 52.0], [18.01, 52.01], [18.0, 52.01], [18.0, 52.0]]],
};

/** U-shaped (concave) parcel: its centroid falls in the notch, outside the parcel */
const uShape: ParcelGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [18.0, 52.0], [18.03, 52.0], [18.03, 52.03], [18.02, 52.03], [18.02, 52.01],
      [18.01, 52.01], [18.01, 52.03], [18.0, 52.03], [18.0, 52.0],
    ],
  ],
};

describe('pointInGeometry', () => {
  it('handles Polygon and MultiPolygon', () => {
    expect(pointInGeometry(52.005, 18.005, square)).toBe(true);
    expect(pointInGeometry(52.02, 18.005, square)).toBe(false);
    const multi: ParcelGeometry = { type: 'MultiPolygon', coordinates: [square.coordinates, [[[19, 53], [19.01, 53], [19.01, 53.01], [19, 53]]]] };
    expect(pointInGeometry(53.002, 19.005, multi)).toBe(true);
  });
});

describe('labelPoint (where the parcel tag is drawn)', () => {
  it('is the centroid for a convex parcel', () => {
    const [lat, lon] = labelPoint(square);
    expect(lat).toBeCloseTo(52.005, 4);
    expect(lon).toBeCloseTo(18.005, 4);
  });

  it('stays INSIDE a concave parcel (centroid in the notch is moved inside)', () => {
    const [lat, lon] = labelPoint(uShape);
    expect(pointInGeometry(lat, lon, uShape)).toBe(true);
  });
});

describe('interiorGrid', () => {
  it('only returns points inside the parcel', () => {
    const pts = interiorGrid(uShape, 6);
    expect(pts.length).toBeGreaterThan(5);
    expect(pts.every(([lat, lon]) => pointInGeometry(lat, lon, uShape))).toBe(true);
  });
});

describe('nearestBetween (distance to the nearest ditch)', () => {
  const proj = LocalProjection.forBbox(bboxOf(square));

  it('measures the gap in metres to a ditch east of the parcel', () => {
    // ditch on meridian 18.0115°, i.e. 0.0015° east of the edge ≈ 0.0015 × 111 320 × cos 52° ≈ 102.8 m
    const link = nearestBetween(square, [[51.99, 18.0115], [52.02, 18.0115]], proj)!;
    expect(link.distM).toBeCloseTo(102.8, 0);
    expect(link.parcelPoint[1]).toBeCloseTo(18.01, 6);
    expect(link.linePoint[1]).toBeCloseTo(18.0115, 6);
  });

  it('is 0 when the ditch runs through the parcel', () => {
    expect(nearestBetween(square, [[51.99, 18.005], [52.02, 18.005]], proj)!.distM).toBe(0);
  });

  it('returns null for an empty line', () => {
    expect(nearestBetween(square, [], proj)).toBeNull();
  });
});
