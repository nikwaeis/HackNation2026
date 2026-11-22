import type { Page } from '@playwright/test';

type MapsWindow = Window & {
  __wodoplonMaps?: Record<
    string,
    {
      setView: (c: [number, number], z: number, o?: object) => void;
      getZoom: () => number;
      getCenter: () => { lat: number; lng: number };
      latLngToContainerPoint: (c: [number, number]) => { x: number; y: number };
      getContainer: () => HTMLElement;
      once: (ev: string, fn: () => void) => void;
    }
  >;
};

export type MapName = 'home' | 'report';

/** Wait until the Leaflet map registered its dev handle (see DevMapHandle in ParcelMap.tsx) */
export async function waitForMap(page: Page, name: MapName = 'home') {
  await page.waitForFunction((n) => Boolean((window as MapsWindow).__wodoplonMaps?.[n]), name);
}

/** Jump the map to a place (no animation) and wait for the move to finish */
export async function showOnMap(page: Page, lat: number, lon: number, zoom: number, name: MapName = 'home') {
  await page.evaluate(
    ([la, lo, z, n]) =>
      new Promise<void>((resolve) => {
        const map = (window as MapsWindow).__wodoplonMaps![n as string];
        map.once('moveend', () => resolve());
        map.setView([la as number, lo as number], z as number, { animate: false });
        // setView to the current view fires no moveend
        window.setTimeout(resolve, 600);
      }),
    [lat, lon, zoom, name] as const,
  );
}

/** Real mouse click on the screen pixel of a WGS84 point */
export async function clickLatLon(page: Page, lat: number, lon: number, name: MapName = 'home') {
  const pt = await page.evaluate(
    ([la, lo, n]) => {
      const map = (window as MapsWindow).__wodoplonMaps![n as string];
      const p = map.latLngToContainerPoint([la as number, lo as number]);
      const r = map.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [lat, lon, name] as const,
  );
  await page.mouse.click(pt.x, pt.y);
}

export async function mapState(page: Page, name: MapName = 'home') {
  return page.evaluate((n) => {
    const map = (window as MapsWindow).__wodoplonMaps![n];
    const c = map.getCenter();
    return { zoom: map.getZoom(), lat: c.lat, lon: c.lng };
  }, name);
}
