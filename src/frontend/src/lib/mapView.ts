/**
 * Remembers where the home-page map was, so coming back from a report ("Nowe sprawdzenie") keeps the
 * map on the same spot instead of jumping to the start view. Kept per browser tab (sessionStorage):
 * a reload stays put, a new tab opens on the default view.
 */
export interface MapView {
  center: [number, number];
  zoom: number;
}

const STORAGE_KEY = 'wodoplon-map-view';

// in-memory copy for browsers where sessionStorage is blocked
let current: MapView | null = null;

function isMapView(value: unknown): value is MapView {
  if (!value || typeof value !== 'object') return false;
  const { center, zoom } = value as Partial<MapView>;
  return (
    Array.isArray(center) &&
    center.length === 2 &&
    Number.isFinite(center[0]) &&
    Number.isFinite(center[1]) &&
    Math.abs(center[0]) <= 90 &&
    Math.abs(center[1]) <= 180 &&
    typeof zoom === 'number' &&
    Number.isFinite(zoom) &&
    zoom >= 0 &&
    zoom <= 22
  );
}

export function loadMapView(): MapView | null {
  if (current) return current;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isMapView(parsed)) current = parsed;
  } catch {
    // unreadable storage or malformed value: fall back to the default view
  }
  return current;
}

export function saveMapView(view: MapView): void {
  if (!isMapView(view)) return;
  current = {
    center: [Number(view.center[0].toFixed(6)), Number(view.center[1].toFixed(6))],
    zoom: view.zoom,
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // private mode / blocked storage: the view is only kept for this page load
  }
}

/** Test helper: forget the remembered view */
export function clearMapView(): void {
  current = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
