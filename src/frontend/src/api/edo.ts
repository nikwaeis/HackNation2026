/*
 * Copernicus European Drought Observatory (EDO) — Combined Drought Indicator (CDI), WMS layer "cdiad".
 *
 * Verified against the live service (2026-11-21):
 *  - the layer has a TIME dimension in 10-day steps ("dekads": the 1st, 11th and 21st of each month), with
 *    nearestValue="0": any other date gives HTTP 400, so every tile fails -> TIME must be snapped to a dekad;
 *  - without TIME the server uses its default (the latest dekad);
 *  - the grid is ~5 km, so at field zoom (14+) a whole tile lies inside one cell: fully transparent
 *    ("no drought warning") or one flat colour;
 *  - GetCapabilities is CORS-enabled (Access-Control-Allow-Origin: *).
 */

export const EDO_WMS_URL = 'https://drought.emergency.copernicus.eu/api/wms';
export const EDO_LAYER = 'cdiad';
/** First dekad of the CDI v4 archive */
export const EDO_FIRST_DATE = '2012-01-01';
/** Above this zoom a 256 px tile is far smaller than one ~5 km CDI cell */
export const EDO_COARSE_ZOOM = 10;
/**
 * The EDO server rate-limits (HTTP 429, observed live): Chrome then blocks the HTML error page as an image
 * (ERR_BLOCKED_BY_ORB) and every tile fails. Tiles above this zoom add no detail to a ~5 km grid, so Leaflet
 * upscales zoom-9 tiles instead of requesting dozens of identical ones at field zoom.
 */
export const EDO_MAX_NATIVE_ZOOM = 9;
/** Larger tiles = fewer requests against the rate limit */
export const EDO_TILE_SIZE = 512;

const CAPS_TIMEOUT_MS = 8_000;

/** "2025-07-15" -> "2025-07-11"; "2026-11-30" -> "2026-11-21"; "2026-11-05" -> "2026-11-01" */
export function dekadOf(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const day = d >= 21 ? 21 : d >= 11 ? 11 : 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Dekad to request: the dekad of the wanted date (report date) or the latest available one,
 * clamped to the archive range. Returns null when nothing is known (let the server use its default).
 */
export function edoTimeFor(wanted: string | null | undefined, latest: string | null): string | null {
  if (!wanted) return latest;
  let t = dekadOf(wanted);
  if (latest && t > latest) t = latest;
  if (t < EDO_FIRST_DATE) t = EDO_FIRST_DATE;
  return t;
}

/** Latest dekad of the "cdiad" layer from a GetCapabilities document (default="…" or the end of the time range) */
export function parseLatestDekad(capabilitiesXml: string): string | null {
  const at = capabilitiesXml.indexOf(`<Name>${EDO_LAYER}</Name>`);
  if (at < 0) return null;
  const layerPart = capabilitiesXml.slice(at, at + 6000);
  const dim = /<Dimension\b[^>]*name="time"[^>]*>([^<]*)<\/Dimension>/.exec(layerPart);
  if (!dim) return null;
  const def = /default="(\d{4}-\d{2}-\d{2})/.exec(dim[0]);
  if (def) return def[1];
  const range = /\/(\d{4}-\d{2}-\d{2})\//.exec(dim[1]);
  return range ? range[1] : null;
}

let latestCache: Promise<string | null> | null = null;

/** Latest available dekad (cached for the session); null if the service does not answer */
export function fetchLatestDekad(): Promise<string | null> {
  if (!latestCache) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), CAPS_TIMEOUT_MS);
    latestCache = fetch(`${EDO_WMS_URL}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`EDO ${r.status}`))))
      .then(parseLatestDekad)
      .catch(() => {
        latestCache = null; // retry next time the layer is switched on
        return null;
      })
      .finally(() => window.clearTimeout(timer));
  }
  return latestCache;
}
