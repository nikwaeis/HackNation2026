import type { MultiPolygon, Polygon, Position } from 'geojson';

/** Small, print-safe SVG outline of the parcel (no map tiles needed). */
export function ParcelShape({ geometry, className = '' }: { geometry: Polygon | MultiPolygon | null; className?: string }) {
  if (!geometry) return null;
  const polygons: Position[][][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const all = polygons.flat(2);
  if (all.length < 3) return null;

  const lats = all.map((p) => p[1]);
  const meanLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const k = Math.cos((meanLat * Math.PI) / 180); // equirectangular correction
  const xs = all.map((p) => p[0] * k);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const size = 100;
  const pad = 8;
  const scale = (size - pad * 2) / span;
  const offX = (size - (maxX - minX) * scale) / 2;
  const offY = (size - (maxY - minY) * scale) / 2;

  const d = polygons
    .map((poly) =>
      poly
        .map(
          (ring) =>
            ring
              .map((p, i) => {
                const x = offX + (p[0] * k - minX) * scale;
                const y = offY + (maxY - p[1]) * scale;
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(' ') + ' Z',
        )
        .join(' '),
    )
    .join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label="Kształt działki">
      <rect x="0" y="0" width={size} height={size} rx="10" fill="var(--color-field-soft)" />
      <path d={d} fill="color-mix(in srgb, var(--color-field) 30%, transparent)" stroke="var(--color-field)" strokeWidth="2.5" strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  );
}
