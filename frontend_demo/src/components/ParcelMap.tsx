import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { MultiPolygon, Polygon } from 'geojson';
import { MousePointerClick } from 'lucide-react';

/*
 * Thin wrapper over plain Leaflet (BSD-2-Clause). react-leaflet is intentionally not used:
 * it is licensed under Hippocratic-2.1, which is not a permissive MIT/BSD/Apache license.
 */

const POLAND_CENTER: L.LatLngTuple = [52.1, 19.4];
const POLAND_BOUNDS = L.latLngBounds([48.5, 13.5], [55.2, 24.6]);
const PARCEL_STYLE: L.PathOptions = { color: '#f5c518', weight: 3, fillColor: '#f5c518', fillOpacity: 0.18 };
const POINT_STYLE: L.CircleMarkerOptions = { radius: 9, color: '#ffffff', weight: 3, fillColor: '#1d6aa3', fillOpacity: 1 };

interface Props {
  point: { lat: number; lon: number } | null;
  geometry: Polygon | MultiPolygon | null;
  /** Changes once per report; the map refits to the parcel only when it changes. */
  geometryKey: string | null;
  disabled?: boolean;
  onPick: (lat: number, lon: number) => void;
}

function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, {
    center: POLAND_CENTER,
    zoom: 6,
    minZoom: 5,
    maxBounds: POLAND_BOUNDS.pad(0.3),
  });

  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const ortho = L.tileLayer.wms('https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution', {
    layers: 'Raster',
    format: 'image/jpeg',
    maxZoom: 19,
    attribution: 'Ortofotomapa &copy; <a href="https://www.geoportal.gov.pl">GUGiK</a>',
  });
  const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Zdjęcia &copy; Esri, Maxar, Earthstar Geographics',
  });
  const parcels = L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', {
    layers: 'dzialki,numery_dzialek',
    format: 'image/png',
    transparent: true,
    minZoom: 15,
    maxZoom: 19,
    attribution: 'Działki &copy; <a href="https://www.geoportal.gov.pl">GUGiK KIEG</a>',
  });

  osm.addTo(map);
  // The KIEG parcel overlay is off by default: the public GUGiK service rate-limits requests
  // and then returns "limit exceeded" images instead of tiles. Users can enable it in the layer switcher.
  L.control
    .layers(
      {
        'Mapa (OpenStreetMap)': osm,
        'Zdjęcie lotnicze (Geoportal)': ortho,
        'Satelita (Esri)': esri,
      },
      { 'Granice działek (od przybliżenia)': parcels },
      { position: 'topright' },
    )
    .addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  return map;
}

export function ParcelMap({ point, geometry, geometryKey, disabled, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pointLayerRef = useRef<L.CircleMarker | null>(null);
  const parcelLayerRef = useRef<L.GeoJSON | null>(null);

  // Latest callback/flag without re-binding the click handler
  const pickRef = useRef({ onPick, disabled });
  pickRef.current = { onPick, disabled };

  // Create the map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = createMap(el);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { onPick: pick, disabled: off } = pickRef.current;
      if (off) return;
      pick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      pointLayerRef.current = null;
      parcelLayerRef.current = null;
    };
  }, []);

  // Clicked point
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!point) {
      pointLayerRef.current?.remove();
      pointLayerRef.current = null;
      return;
    }
    if (pointLayerRef.current) pointLayerRef.current.setLatLng([point.lat, point.lon]);
    else pointLayerRef.current = L.circleMarker([point.lat, point.lon], POINT_STYLE).addTo(map);
  }, [point]);

  // Parcel outline from the report + fitBounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    parcelLayerRef.current?.remove();
    parcelLayerRef.current = null;
    if (!geometry) return;
    const layer = L.geoJSON(geometry, { style: PARCEL_STYLE, interactive: false }).addTo(map);
    parcelLayerRef.current = layer;
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    // geometry object identity may change on re-render; the key identifies the report
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryKey, geometry === null]);

  return (
    <div className="relative h-full min-h-[340px] overflow-hidden rounded-2xl border border-line">
      <div
        ref={containerRef}
        className="h-full min-h-[340px] w-full"
        role="application"
        aria-label="Mapa Polski. Kliknij, aby wskazać pole."
      />
      {!point && !geometry && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[500] flex justify-center px-4">
          <p className="flex items-center gap-2 rounded-full bg-ink/90 px-4 py-2 text-sm font-semibold text-white">
            <MousePointerClick className="size-4 shrink-0" aria-hidden />
            Przybliż mapę i kliknij swoje pole
          </p>
        </div>
      )}
    </div>
  );
}
