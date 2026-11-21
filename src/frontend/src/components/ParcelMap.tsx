import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import {
  GeoJSON,
  MapContainer,
  Marker,
  TileLayer,
  WMSTileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { CloudRain, Grid2x2, Layers, Map as MapIcon } from 'lucide-react';
import type { ParcelGeometry, WaterDeficitLevel } from '../types/api';
import type { TranslationDict } from '../i18n/translations';

const POLAND_CENTER: [number, number] = [52.06, 18.6];
const POLAND_ZOOM = 6;

const SELECTED_PIN_ICON = L.divIcon({
  className: 'wodoplon-map-pin',
  html: `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2C8.82 2 3 7.82 3 15C3 24.75 16 38 16 38C16 38 29 24.75 29 15C29 7.82 23.18 2 16 2Z" fill="#1D6FA5" stroke="#FFFFFF" stroke-width="2.5"/>
    <circle cx="16" cy="14.5" r="4.5" fill="#FFFFFF"/>
  </svg>`,
  iconSize: [32, 40],
  iconAnchor: [16, 38],
});

interface ParcelMapProps {
  t: TranslationDict;
  interactive?: boolean;
  selectedPoint?: { lat: number; lon: number } | null;
  onSelectPoint?: (lat: number, lon: number) => void;
  polygon?: ParcelGeometry | null;
  riskLevel?: WaterDeficitLevel;
  className?: string;
}

function riskPolygonColor(level?: WaterDeficitLevel): string {
  switch (level) {
    case 'CRITICAL':
      return '#b91c1c';
    case 'HIGH':
      return '#b83d0b';
    case 'MODERATE':
      return '#a16207';
    case 'LOW':
      return '#146c43';
    default:
      return '#1d6fa5';
  }
}

function MapClickHandler({
  enabled,
  onSelect,
  onZoomChange,
}: {
  enabled: boolean;
  onSelect?: (lat: number, lon: number) => void;
  onZoomChange: (zoom: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled && onSelect) {
        onSelect(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      }
    },
    zoomend(e) {
      onZoomChange(e.target.getZoom());
    },
  });
  return null;
}

function FitPolygonBounds({ polygon }: { polygon: ParcelGeometry | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!polygon) return;
    try {
      const layer = L.geoJSON(polygon as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          paddingTopLeft: [28, 28],
          paddingBottomRight: [28, 64],
          maxZoom: 16,
        });
      }
    } catch {
      // Ignore malformed geometry
    }
  }, [map, polygon]);

  return null;
}

export function ParcelMap({
  t,
  interactive = true,
  selectedPoint = null,
  onSelectPoint,
  polygon = null,
  riskLevel,
  className = 'h-[420px] lg:h-full',
}: ParcelMapProps) {
  const [baseLayer, setBaseLayer] = useState<'osm' | 'orto'>('osm');
  const [showParcels, setShowParcels] = useState(false);
  const [showDrought, setShowDrought] = useState(false);
  const [zoom, setZoom] = useState(POLAND_ZOOM);

  const polygonStyle = useMemo(() => {
    const color = riskPolygonColor(riskLevel);
    return {
      color,
      weight: 3,
      fillColor: color,
      fillOpacity: 0.22,
    };
  }, [riskLevel]);

  const polygonKey = useMemo(() => (polygon ? JSON.stringify(polygon) : 'none'), [polygon]);

  return (
    <div
      className={`relative isolate z-0 w-full overflow-hidden ${className}`}
      style={{ backgroundColor: '#e8eef4' }}
    >
      <MapContainer
        center={POLAND_CENTER}
        zoom={POLAND_ZOOM}
        minZoom={5}
        maxZoom={18}
        zoomControl={false}
        scrollWheelZoom
        className="h-full w-full"
      >
        <ZoomControl position="topright" />

        {baseLayer === 'osm' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <WMSTileLayer
            url="https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution"
            layers="Raster"
            format="image/jpeg"
            transparent={false}
            attribution="Geoportal.gov.pl (GUGiK)"
          />
        )}

        {showParcels && (
          <WMSTileLayer
            url="https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"
            layers="dzialki,numery_dzialek"
            format="image/png"
            transparent
            opacity={0.9}
            attribution="GUGiK KIEG"
          />
        )}

        {showDrought && (
          <WMSTileLayer
            url="https://drought.emergency.copernicus.eu/api/wms"
            layers="cdiad"
            format="image/png"
            transparent
            opacity={0.56}
            attribution="Copernicus EDO"
          />
        )}

        {selectedPoint && (
          <Marker position={[selectedPoint.lat, selectedPoint.lon]} icon={SELECTED_PIN_ICON} />
        )}

        {polygon && (
          <GeoJSON
            key={polygonKey}
            data={polygon as GeoJSON.GeoJsonObject}
            style={() => polygonStyle}
          />
        )}

        <MapClickHandler enabled={interactive} onSelect={onSelectPoint} onZoomChange={setZoom} />
        <FitPolygonBounds polygon={polygon} />
      </MapContainer>

      {/* Quiet non-interactive map instruction ribbon (offset on desktop for floating left form) */}
      {interactive && (
        <div className="pointer-events-none absolute left-4 right-16 top-4 z-[400] flex justify-start lg:left-[448px]">
          <div
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--ink-secondary)',
              boxShadow: 'var(--shadow-float)',
            }}
          >
            {selectedPoint ? t.mapHintSelected : t.mapHint}
          </div>
        </div>
      )}

      {/* Zoom hint for cadastral parcels */}
      {showParcels && zoom < 14 && (
        <div className="pointer-events-none absolute bottom-20 left-4 right-4 z-[400] flex justify-start lg:left-[448px]">
          <div
            className="rounded-lg px-3.5 py-2 text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--ink-primary)',
              boxShadow: 'var(--shadow-float)',
            }}
          >
            {t.zoomInForParcels}
          </div>
        </div>
      )}

      {/* EDO Drought legend card (soft float, zero heavy border) */}
      {showDrought && (
        <div
          className="no-print absolute right-14 top-4 z-[400] rounded-xl px-3.5 py-2.5 text-xs"
          style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--ink-primary)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <p className="font-semibold" style={{ color: 'var(--ink-primary)' }}>
            {t.edoLegendTitle}
          </p>
          <div className="mt-1.5 flex items-center gap-3" style={{ color: 'var(--ink-secondary)' }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#eab308' }} />
              {t.edoLegendWatch}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#ea580c' }} />
              {t.edoLegendWarning}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#dc2626' }} />
              {t.edoLegendAlert}
            </span>
          </div>
        </div>
      )}

      {/* Single cohesive floating layer dock — unmistakable map toolbar */}
      <div
        className={`no-print absolute z-[400] flex items-center ${
          interactive
            ? 'bottom-5 left-4 right-4 lg:left-[448px] lg:right-auto'
            : 'bottom-7 left-3 right-3'
        }`}
      >
        <div
          role="toolbar"
          aria-label="Warstwy mapy"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl p-1"
          style={{
            backgroundColor: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          <button
            type="button"
            onClick={() => setBaseLayer('osm')}
            aria-pressed={baseLayer === 'osm'}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${
              interactive ? 'min-h-[36px] px-3 text-sm' : 'min-h-[32px] px-2.5 text-xs'
            }`}
            style={{
              backgroundColor: baseLayer === 'osm' ? 'var(--brand-primary)' : 'transparent',
              color: baseLayer === 'osm' ? 'var(--brand-on-primary)' : 'var(--ink-secondary)',
            }}
          >
            <MapIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{t.layerMap}</span>
          </button>

          <button
            type="button"
            onClick={() => setBaseLayer('orto')}
            aria-pressed={baseLayer === 'orto'}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${
              interactive ? 'min-h-[36px] px-3 text-sm' : 'min-h-[32px] px-2.5 text-xs'
            }`}
            style={{
              backgroundColor: baseLayer === 'orto' ? 'var(--brand-primary)' : 'transparent',
              color: baseLayer === 'orto' ? 'var(--brand-on-primary)' : 'var(--ink-secondary)',
            }}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{t.layerOrto}</span>
          </button>

          <span
            aria-hidden="true"
            className="mx-0.5 hidden h-5 w-px sm:inline-block"
            style={{ backgroundColor: 'var(--hairline)' }}
          />

          {interactive && (
            <button
              type="button"
              onClick={() => setShowParcels((v) => !v)}
              aria-pressed={showParcels}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors"
              style={{
                backgroundColor: showParcels ? 'var(--ink-primary)' : 'transparent',
                color: showParcels ? 'var(--bg-surface)' : 'var(--ink-secondary)',
              }}
            >
              <Grid2x2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{t.layerParcels}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDrought((v) => !v)}
            aria-pressed={showDrought}
            className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${
              interactive ? 'min-h-[36px] px-3 text-sm' : 'min-h-[32px] px-2.5 text-xs'
            }`}
            style={{
              backgroundColor: showDrought ? 'var(--ink-primary)' : 'transparent',
              color: showDrought ? 'var(--bg-surface)' : 'var(--ink-secondary)',
            }}
          >
            <CloudRain className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{t.layerDrought}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
