import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Polygon,
  Polyline,
  TileLayer,
  WMSTileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import {
  AlertCircle,
  ChevronDown,
  Info,
  CloudRain,
  Grid2x2,
  Layers,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  Maximize2,
  Navigation,
  RotateCcw,
  ZoomOut,
} from 'lucide-react';
import {
  EDO_COARSE_ZOOM,
  EDO_LAYER,
  EDO_MAX_NATIVE_ZOOM,
  EDO_TILE_SIZE,
  EDO_WMS_URL,
  edoTimeFor,
  fetchLatestDekad,
} from '../api/edo';
import type { ParcelGeometry } from '../types/api';
import type { TranslationDict } from '../i18n/translations';
import {
  fetchRunoffContext,
  fetchViewContext,
  fetchWaterContext,
  type FieldArea,
  type RunoffContext,
  type ViewContext,
  type WaterContext,
} from '../api/mapContext';
import {
  LocalProjection,
  bboxOf,
  clipPathFromRings,
  interiorGrid,
  labelPoint,
  projectRings,
  type LatLon,
} from '../lib/geo';
import { POLAND_BORDER } from '../lib/polandBorder';

export const POLAND_CENTER: [number, number] = [52.06, 18.6];

/**
 * Layers that only cover Poland get their own panes, clipped to the Polish border: the Geoportal orthophoto
 * is black outside its coverage, and EDO drought warnings for Germany or Ukraine are noise next to a Polish
 * parcel. The orthophoto pane sits just under the tile pane (parcel boundaries stay on top of the photo).
 */
const ORTO_PANE = 'ortoPane';
const DROUGHT_PANE = 'droughtPane';
/**
 * The border is ~1 km accurate (Natural Earth): fine for the ~5 km drought grid at any zoom, but at field zoom
 * it would visibly trim real photo along the border, so the photo is clipped only at country / region zooms.
 */
const ORTO_CLIP_MAX_ZOOM = 9;
const CLIPPED_PANES = [
  { name: ORTO_PANE, maxZoom: ORTO_CLIP_MAX_ZOOM },
  { name: DROUGHT_PANE, maxZoom: Infinity },
];
export const POLAND_ZOOM = 6;

/**
 * GUGiK KIEG WMS draws parcel boundaries only at large scales: measured 2026-11-21, a 256 px tile at
 * ~0.8 m/px (Leaflet zoom 17 in Poland) has lines, at ~1.4 m/px (zoom 16) it comes back empty/transparent.
 */
const PARCELS_MIN_ZOOM = 17;
/** Parcel numbers get legible from this zoom */
const PARCEL_NUMBERS_MIN_ZOOM = 18;
/** Viewport-wide fields and ditches are fetched from this zoom (keeps the Overpass box small) */
const VIEW_CONTEXT_MIN_ZOOM = 14;
/** Clicking below this zoom only zooms in — a single field is not identifiable at country scale */
const PICK_MIN_ZOOM = 14;

const NEON = '#00E5FF';
const WATER = '#2F80ED';
const OSM_OVERLAY_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ODbL)';
const OPEN_METEO_ATTRIBUTION = '<a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0)';
const WARN = '#F59E0B';
const HATCH_ID = 'wodoplon-parcel-hatch';

const FIELD_STYLE_PHOTO = { color: '#FFFFFF', weight: 1.2, opacity: 0.6, fillColor: NEON, fillOpacity: 0.11 };
const FIELD_STYLE_MAP = { color: '#2E7D32', weight: 1, opacity: 0.5, fillColor: '#43A047', fillOpacity: 0.1 };
const FIELD_HOVER_STYLE = { color: NEON, weight: 2.5, opacity: 1, fillColor: NEON, fillOpacity: 0.24 };

/** Slope above which surface runoff matters (same threshold as backend Recommendations.SteepSlopeDeg) */
const RUNOFF_SLOPE_DEG = 3;
/** Zoom out to include the nearest ditch only when it is close enough to matter */
const MAX_FIT_WATER_M = 600;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const SELECTED_PIN_ICON = L.divIcon({
  className: 'wodoplon-map-pin',
  html: `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 2C8.82 2 3 7.82 3 15C3 24.75 16 38 16 38C16 38 29 24.75 29 15C29 7.82 23.18 2 16 2Z" fill="#1B5E20" stroke="#FFFFFF" stroke-width="2.5"/>
    <circle cx="16" cy="14.5" r="4.5" fill="#FFFFFF"/>
  </svg>`,
  iconSize: [32, 40],
  iconAnchor: [16, 38],
});

function parcelTagIcon(title: string, subtitle?: string): L.DivIcon {
  return L.divIcon({
    className: 'parcel-tag-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="parcel-tag">
      <svg class="parcel-tag__pin" width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true">
        <path d="M11 1C5.48 1 1 5.37 1 10.76C1 18.08 11 27 11 27C11 27 21 18.08 21 10.76C21 5.37 16.52 1 11 1Z" fill="#0F766E" stroke="#FFFFFF" stroke-width="2"/>
        <circle cx="11" cy="10.5" r="3.6" fill="#FFFFFF"/>
      </svg>
      <div class="parcel-tag__card">
        <span class="parcel-tag__title">${escapeHtml(title)}</span>
        ${subtitle ? `<span class="parcel-tag__sub">${escapeHtml(subtitle)}</span>` : ''}
      </div>
    </div>`,
  });
}

function waterTagIcon(text: string): L.DivIcon {
  return L.divIcon({
    className: 'water-tag-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="water-tag">${escapeHtml(text)}</div>`,
  });
}

function runoffArrowIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: 'runoff-arrow-icon',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<svg class="runoff-arrow" width="34" height="34" viewBox="0 0 26 26" style="transform: rotate(${bearing.toFixed(
      1,
    )}deg)" aria-hidden="true">
      <path d="M13 3 L19 12 L15 12 L15 23 L11 23 L11 12 L7 12 Z" fill="#E0FBFF" stroke="#00838F" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>`,
  });
}

export interface ParcelMapLabel {
  title: string;
  subtitle?: string;
}

interface ParcelMapProps {
  t: TranslationDict;
  interactive?: boolean;
  selectedPoint?: { lat: number; lon: number } | null;
  onSelectPoint?: (lat: number, lon: number) => void;
  /** Parcel polygon from the analysis report */
  polygon?: ParcelGeometry | null;
  /** Boundary of the parcel the user clicked / typed (from ULDK), drawn instead of the pin */
  selectionOutline?: ParcelGeometry | null;
  selectionLoading?: boolean;
  /** Tag shown in the middle of the highlighted parcel */
  parcelLabel?: ParcelMapLabel | null;
  /** Mean slope from the analysis; runoff arrows are drawn only above 3° */
  slopeDeg?: number | null;
  /** Draw nearby ditches / streams with a distance callout */
  showWaterFeatures?: boolean;
  defaultBaseLayer?: 'osm' | 'orto';
  /** Switch to the aerial photo once a parcel is outlined (unless the user picked a layer) */
  autoAerial?: boolean;
  /** Tailwind classes positioning the floating hint / layer dock next to a desktop side panel */
  overlayOffsetClass?: string;
  /** Leave room in the top-right corner for floating action buttons */
  reserveTopRight?: boolean;
  /** Agricultural fields loaded for the visible area (null while unknown) — used by the land-type check */
  onViewFieldsChange?: (fields: FieldArea[] | null) => void;
  /** 'warn' draws the picked parcel in amber (looks built-up / non-agricultural) */
  selectionTone?: 'ok' | 'warn';
  /** Date the Copernicus EDO drought layer should show (report: analysis date); default = latest dekad */
  droughtDate?: string | null;
  /** Starting view (defaults to the whole of Poland) */
  initialView?: { center: [number, number]; zoom: number };
  /** Called after every pan / zoom, e.g. to remember the view between pages */
  onViewChange?: (view: { center: [number, number]; zoom: number }) => void;
  /** Show cadastral parcel boundaries from the start */
  defaultShowParcels?: boolean;
  /** Draw all ditches / streams in the visible area (not only around the parcel) */
  showViewportWater?: boolean;
  className?: string;
}

type ViewStatus = 'idle' | 'loading' | 'ready' | 'failed';

function MapClickHandler({
  enabled,
  onSelect,
  onZoomChange,
  onNotice,
  onViewChange,
}: {
  enabled: boolean;
  onSelect?: (lat: number, lon: number) => void;
  onZoomChange: (zoom: number) => void;
  onNotice: (kind: 'zoomed') => void;
  onViewChange?: (view: { center: [number, number]; zoom: number }) => void;
}) {
  const map = useMap();
  useMapEvents({
    click(e) {
      if (!enabled || !onSelect) return;
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      if (map.getZoom() < PICK_MIN_ZOOM) {
        // country / region scale: zoom towards the click instead of picking a random parcel
        map.flyTo(e.latlng, 16, { duration: 1 });
        onNotice('zoomed');
        return;
      }
      // exact click coordinates go to ULDK GetParcelByXY; the land-type check runs on the result
      onSelect(Number(lat.toFixed(6)), Number(lon.toFixed(6)));
    },
    zoomend(e) {
      onZoomChange(e.target.getZoom());
    },
    moveend(e) {
      if (!onViewChange) return;
      const center = e.target.getCenter();
      onViewChange({ center: [center.lat, center.lng], zoom: e.target.getZoom() });
    },
  });
  return null;
}

function FitPolygonBounds({
  polygon,
  padLeft,
  extraPoint,
}: {
  polygon: ParcelGeometry | null | undefined;
  padLeft: number;
  /** e.g. the nearest ditch, so the distance callout stays in view */
  extraPoint?: LatLon | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!polygon) return;
    try {
      const layer = L.geoJSON(polygon as GeoJSON.GeoJsonObject);
      const bounds = layer.getBounds();
      if (extraPoint) bounds.extend(extraPoint);
      if (bounds.isValid()) {
        // keep the parcel clear of the floating side panel on wide screens
        const wide = map.getSize().x >= 1024;
        map.fitBounds(bounds, {
          paddingTopLeft: [wide ? padLeft : 40, 80],
          paddingBottomRight: [60, 110],
          maxZoom: 17,
        });
      }
    } catch {
      // Ignore malformed geometry
    }
    // extraPoint is compared by value via its coordinates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, polygon, padLeft, extraPoint?.[0], extraPoint?.[1]]);

  return null;
}

/** Leaflet internals used to follow the zoom animation (stable across Leaflet 1.x) */
type ZoomingMap = L.Map & {
  _animatingZoom?: boolean;
  _latLngToNewLayerPoint(latlng: L.LatLngExpression, zoom: number, center: L.LatLngExpression): L.Point;
};

/** Leaflet's zoom animation: `transition: transform 0.25s cubic-bezier(0,0,0.25,1)` on the tile levels */
const ZOOM_ANIM_MS = 250;

/** CSS cubic-bezier(0, 0, 0.25, 1) at time t (0..1) */
function zoomEasing(t: number): number {
  // x(s) = 0.75 s² + 0.25 s³ is monotonic on [0, 1]: find s by bisection, then y(s) = 3 s² − 2 s³
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const s = (lo + hi) / 2;
    if (0.75 * s * s + 0.25 * s * s * s < t) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return 3 * s * s - 2 * s * s * s;
}

/**
 * Clips CLIPPED_PANES to the Polish border. Panes are positioned in layer points, so the clip path is the
 * border projected to layer points: it is stable while panning and recomputed whenever the zoom changes.
 * During an animated zoom Leaflet scales the old tiles towards their final position with a CSS transition;
 * the clip path follows them frame by frame with the same easing. (A CSS transition on clip-path itself is
 * composited by Chrome and the panes showed unclipped while it ran.)
 */
function PolandClip() {
  const map = useMap() as ZoomingMap;

  useEffect(() => {
    let frame = 0;
    const border = (project: (lat: number, lon: number) => L.Point) => projectRings(POLAND_BORDER, project);
    const current = () => border((lat, lon) => map.latLngToLayerPoint([lat, lon]));

    function apply(zoom: number, rings: { x: number; y: number }[][], animating: boolean) {
      let clip: string | null = null;
      for (const { name, maxZoom } of CLIPPED_PANES) {
        const el = map.getPane(name);
        if (!el) continue;
        // zooming past the limit keeps the clip until the animation ends; zoomend then drops it
        const clipped = zoom <= maxZoom || (animating && el.style.clipPath !== '');
        clip ??= clipped ? clipPathFromRings(rings) : null;
        el.style.clipPath = clipped && clip ? clip : '';
      }
    }

    function update() {
      cancelAnimationFrame(frame);
      apply(map.getZoom(), current(), false);
    }

    // pinch zoom and flyTo fire `zoom` on every frame; an animated zoom fires it once, at the end
    const onZoom = () => {
      if (!map._animatingZoom) update();
    };

    function onZoomAnim(e: L.ZoomAnimEvent) {
      cancelAnimationFrame(frame);
      const from = current();
      const to = border((lat, lon) => map._latLngToNewLayerPoint([lat, lon], e.zoom, e.center));
      const start = performance.now();
      const step = (now: number) => {
        const k = zoomEasing(Math.min(1, (now - start) / ZOOM_ANIM_MS));
        const rings = from.map((ring, r) =>
          ring.map((p, i) => ({ x: p.x + (to[r][i].x - p.x) * k, y: p.y + (to[r][i].y - p.y) * k })),
        );
        apply(e.zoom, rings, true);
        if (k < 1) frame = requestAnimationFrame(step);
      };
      step(start);
    }

    update();
    map.on('zoom', onZoom);
    map.on('zoomanim', onZoomAnim);
    map.on('zoomend viewreset', update);
    return () => {
      cancelAnimationFrame(frame);
      map.off('zoom', onZoom);
      map.off('zoomanim', onZoomAnim);
      map.off('zoomend viewreset', update);
      for (const { name } of CLIPPED_PANES) {
        const el = map.getPane(name);
        if (el) el.style.clipPath = '';
      }
    };
  }, [map]);

  return null;
}

/**
 * Dev-only handle for end-to-end tests (e2e/*.spec.ts): exposes the Leaflet map so a test can convert
 * lat/lon to a screen point and click a real parcel. Stripped from production builds (import.meta.env.DEV).
 */
function DevMapHandle({ interactive }: { interactive: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wodoplonMaps?: Record<string, L.Map> };
    w.__wodoplonMaps = { ...w.__wodoplonMaps, [interactive ? 'home' : 'report']: map };
  }, [map, interactive]);
  return null;
}

/**
 * Adds a credit line to the map while some derived overlay is shown (licences: OSM ODbL, Open-Meteo CC BY 4.0).
 * The base layers carry their own attribution; overlays computed in the browser need this.
 */
function ExtraAttribution({ text }: { text: string }) {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.addAttribution(text);
    return () => {
      map.attributionControl?.removeAttribution(text);
    };
  }, [map, text]);
  return null;
}

/** Keeps a reference to the Leaflet map for controls rendered outside MapContainer (legend buttons) */
function MapRef({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

/** Loads agricultural fields + ditches for the visible area after the map stops moving */
function ViewportContext({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (ctx: ViewContext | null, status: ViewStatus) => void;
}) {
  const map = useMap();
  const timer = useRef<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const load = () => {
    if (timer.current) window.clearTimeout(timer.current);
    ctrl.current?.abort();
    if (!enabled || map.getZoom() < VIEW_CONTEXT_MIN_ZOOM) {
      onChange(null, 'idle');
      return;
    }
    timer.current = window.setTimeout(() => {
      const b = map.getBounds();
      const c = new AbortController();
      ctrl.current = c;
      onChange(null, 'loading');
      fetchViewContext({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, c.signal)
        .then((ctx) => {
          if (!c.signal.aborted) onChange(ctx, 'ready');
        })
        .catch(() => {
          if (!c.signal.aborted) onChange(null, 'failed');
        });
    }, 350);
  };

  useMapEvents({ moveend: load });

  useEffect(() => {
    load();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      ctrl.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return null;
}

/** "My location" and "whole Poland" shortcuts under the zoom control */
function MapShortcuts({ t, reserveTopRight }: { t: TranslationDict; reserveTopRight: boolean }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (ref.current) {
      // clicks on these buttons must not select a parcel underneath
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.2 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div
      ref={ref}
      className={`glass-panel absolute right-3 z-[1000] flex flex-col overflow-hidden sm:right-4 ${
        reserveTopRight ? 'top-[60px] sm:top-[168px]' : 'top-3 sm:top-[108px]'
      }`}
    >
      {'geolocation' in navigator && (
        <button type="button" onClick={locate} title={t.mapLocateMe} aria-label={t.mapLocateMe} className="map-shortcut-btn">
          <LocateFixed className={`h-[18px] w-[18px] ${locating ? 'animate-pulse' : ''}`} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => map.flyTo(POLAND_CENTER, POLAND_ZOOM, { duration: 1 })}
        title={t.mapWholePoland}
        aria-label={t.mapWholePoland}
        className="map-shortcut-btn"
      >
        <Maximize2 className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Hatch pattern for the parcel fill (referenced as fill="url(#…)" by the Leaflet SVG path) */
function HatchDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
      <defs>
        <pattern id={HATCH_ID} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="9" fill={NEON} fillOpacity="0.15" />
          <line x1="0" y1="0" x2="0" y2="9" stroke={NEON} strokeWidth="2" strokeOpacity="0.55" />
        </pattern>
      </defs>
    </svg>
  );
}

export function ParcelMap({
  t,
  interactive = true,
  selectedPoint = null,
  onSelectPoint,
  polygon = null,
  selectionOutline = null,
  selectionLoading = false,
  parcelLabel = null,
  slopeDeg = null,
  showWaterFeatures = true,
  defaultBaseLayer = 'osm',
  autoAerial = false,
  overlayOffsetClass = 'lg:left-[476px]',
  reserveTopRight = false,
  initialView,
  onViewChange,
  droughtDate = null,
  onViewFieldsChange,
  selectionTone = 'ok',
  defaultShowParcels = false,
  showViewportWater = false,
  className = 'h-[420px] lg:h-full',
}: ParcelMapProps) {
  const startCenter = initialView?.center ?? POLAND_CENTER;
  const startZoom = initialView?.zoom ?? POLAND_ZOOM;
  const [baseLayer, setBaseLayer] = useState<'osm' | 'orto'>(defaultBaseLayer);
  const userPickedBase = useRef(false);
  const [showParcels, setShowParcels] = useState(defaultShowParcels);
  const [showDrought, setShowDrought] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  /** phones only: the legend is a collapsible chip (always open from the sm breakpoint) */
  const [legendOpen, setLegendOpen] = useState(false);
  /** phones only: map data credits (OSM / GUGiK / Copernicus) sit behind an "i" button */
  const [attrOpen, setAttrOpen] = useState(false);

  /* ---- Copernicus EDO drought layer: dekad-aligned TIME + tile status for the legend ---- */
  // undefined = capabilities not fetched yet; null = unknown (service did not answer)
  const [edoLatest, setEdoLatest] = useState<string | null | undefined>(undefined);
  const [edoTiles, setEdoTiles] = useState({ loading: false, loaded: 0, failed: 0 });
  /** bumped by "Spróbuj ponownie" to re-create the layer and re-request its tiles */
  const [edoAttempt, setEdoAttempt] = useState(0);

  useEffect(() => {
    if (!showDrought || edoLatest !== undefined) return;
    let active = true;
    fetchLatestDekad().then((latest) => {
      if (active) setEdoLatest(latest);
    });
    return () => {
      active = false;
    };
  }, [showDrought, edoLatest]);

  const edoReady = edoLatest !== undefined;
  const edoTime = edoReady ? edoTimeFor(droughtDate, edoLatest) : null;
  // react-leaflet compares WMS params by reference and calls setParams (a full redraw) when they differ.
  // An inline object changed on every render, and every tileload re-renders: the layer redrew hundreds of
  // times a second and its tiles never faded in. Keep both objects stable.
  const edoParams = useMemo(() => ({ layers: EDO_LAYER, ...(edoTime ? { TIME: edoTime } : {}) }), [edoTime]);
  const edoEvents = useMemo(
    () => ({
      loading: () => setEdoTiles({ loading: true, loaded: 0, failed: 0 }),
      load: () => setEdoTiles((s) => ({ ...s, loading: false })),
      tileload: () => setEdoTiles((s) => ({ ...s, loaded: s.loaded + 1 })),
      tileerror: () => setEdoTiles((s) => ({ ...s, failed: s.failed + 1 })),
    }),
    [],
  );
  const edoStatus: 'loading' | 'error' | 'partial' | 'ok' = !edoReady
    ? 'loading'
    : edoTiles.failed > 0 && edoTiles.loaded === 0
      ? 'error'
      : edoTiles.loading && edoTiles.loaded + edoTiles.failed === 0
        ? 'loading'
        : edoTiles.failed > 0
          ? 'partial'
          : 'ok';
  const [zoom, setZoom] = useState(startZoom);
  const [viewCtx, setViewCtx] = useState<ViewContext | null>(null);
  const [viewStatus, setViewStatus] = useState<ViewStatus>('idle');
  const [notice, setNotice] = useState<'zoomed' | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const viewWater = viewCtx?.water ?? [];
  const fields = viewCtx?.fields ?? [];

  // keep the last good context while a new area loads, so overlays don't flicker on pan
  function handleViewContext(ctx: ViewContext | null, status: ViewStatus) {
    setViewStatus(status);
    if (status === 'ready' || status === 'idle') {
      setViewCtx(ctx);
      onViewFieldsChange?.(status === 'ready' && ctx ? ctx.fields : null);
    }
  }

  function showNotice(kind: 'zoomed') {
    setNotice(kind);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);


  const focus = polygon ?? selectionOutline;
  const warnTone = selectionTone === 'warn' && !polygon && Boolean(selectionOutline);
  const focusKey = useMemo(() => (focus ? JSON.stringify(focus) : 'none'), [focus]);

  // Aerial photo makes the neon outline pop — switch once a parcel is outlined
  useEffect(() => {
    if (autoAerial && selectionOutline && !userPickedBase.current) setBaseLayer('orto');
  }, [autoAerial, selectionOutline]);

  function pickBase(layer: 'osm' | 'orto') {
    userPickedBase.current = true;
    setBaseLayer(layer);
  }

  /* ---- decorative map context: water features + runoff direction ---- */
  const [water, setWater] = useState<WaterContext | null>(null);
  const [runoff, setRunoff] = useState<RunoffContext | null>(null);
  const wantRunoff = slopeDeg !== null && slopeDeg !== undefined && slopeDeg > RUNOFF_SLOPE_DEG;

  useEffect(() => {
    setWater(null);
    if (!focus || !showWaterFeatures) return;
    const ctrl = new AbortController();
    fetchWaterContext(focus, ctrl.signal)
      .then((ctx) => {
        if (!ctrl.signal.aborted) setWater(ctx);
      })
      .catch(() => {
        // decorative overlay only
      });
    return () => ctrl.abort();
    // focusKey stands in for the geometry object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, showWaterFeatures]);

  useEffect(() => {
    setRunoff(null);
    if (!focus || !wantRunoff) return;
    const ctrl = new AbortController();
    fetchRunoffContext(focus, ctrl.signal)
      .then((ctx) => {
        if (!ctrl.signal.aborted) setRunoff(ctx);
      })
      .catch(() => {
        // decorative overlay only
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, wantRunoff]);

  const tagPoint = useMemo<LatLon | null>(() => (focus ? labelPoint(focus) : null), [focus]);

  const tagIcon = useMemo(
    () => (parcelLabel ? parcelTagIcon(parcelLabel.title, parcelLabel.subtitle) : null),
    [parcelLabel],
  );

  const arrows = useMemo(() => {
    if (!focus || !runoff || !tagPoint) return [];
    const b = bboxOf(focus);
    const proj = LocalProjection.forBbox(b);
    const tagXy = proj.toXy(tagPoint[0], tagPoint[1]);
    const span = Math.max(proj.toXy(b.north, b.east).x - proj.toXy(b.south, b.west).x, 1);
    const icon = runoffArrowIcon(runoff.bearingDeg);
    return interiorGrid(focus, 5)
      .filter((p) => {
        const xy = proj.toXy(p[0], p[1]);
        // keep the parcel tag readable
        return Math.hypot(xy.x - tagXy.x, xy.y - tagXy.y) > span * 0.12;
      })
      .slice(0, 9)
      .map((p) => ({ pos: p, icon }));
  }, [focus, runoff, tagPoint]);

  // callout + connector only for a ditch close enough to influence the parcel (and to fit in view)
  const nearest = water?.nearest && water.nearest.distM <= MAX_FIT_WATER_M ? water.nearest : null;
  const nearestText = nearest
    ? `${nearest.feature.name ?? t.waterTypes[nearest.feature.kind]} (${Math.round(nearest.distM)} m)`
    : null;
  const waterTag = useMemo(() => (nearestText ? waterTagIcon(nearestText) : null), [nearestText]);

  const hintText =
    notice === 'zoomed'
      ? t.mapZoomedIn
        : selectionLoading
          ? t.mapHintLoading
          : selectionOutline
            ? selectionTone === 'warn'
              ? t.mapHintWarn
              : t.mapHintPick
            : selectedPoint
              ? t.mapHintSelected
              : zoom < PICK_MIN_ZOOM
                ? t.mapHintZoom
                : viewStatus === 'loading' && fields.length === 0
                  ? t.mapHintFieldsLoading
                  : fields.length > 0
                    ? t.mapHint
                    : t.mapHintPlain;

  const hasWater = Boolean((water && water.features.length > 0) || viewWater.length > 0);
  const showBounds = showParcels && zoom >= PARCELS_MIN_ZOOM;
  const showFields = interactive && fields.length > 0;
  const showLegend = Boolean(focus) || hasWater || showBounds || showFields;
  const padLeft = interactive ? 500 : 640;

  return (
    <div
      className={`map-attr-collapsible relative isolate z-0 w-full overflow-hidden ${reserveTopRight ? 'map-reserve-top-right' : ''} ${
        interactive ? 'map-pickable' : ''
      } ${attrOpen ? 'attr-open' : ''} ${className}`}
      style={{ backgroundColor: 'var(--map-bg)' }}
    >
      <HatchDefs />
      <MapContainer
        center={startCenter}
        zoom={startZoom}
        minZoom={5}
        maxZoom={19}
        zoomControl={false}
        scrollWheelZoom
        // Leaflet's default Shift+drag box-zoom made Shift change what a press on the map does;
        // a parcel is picked with a plain click, so Shift has no special meaning here.
        boxZoom={false}
        className="h-full w-full"
      >
        <ZoomControl position="topright" />

        {baseLayer === 'osm' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        )}
        {/* the panes always exist so PolandClip keeps their clip path; only the layers come and go */}
        <Pane name={ORTO_PANE} style={{ zIndex: 199 }}>
          {baseLayer === 'orto' && (
            <WMSTileLayer
              url="https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution"
              layers="Raster"
              format="image/jpeg"
              transparent={false}
              maxZoom={19}
              attribution="Geoportal.gov.pl (GUGiK)"
            />
          )}
        </Pane>

        {showParcels && zoom >= PARCELS_MIN_ZOOM && (
          <WMSTileLayer
            // remount when the look changes: Leaflet reads className / layers only on creation
            key={`kieg-${baseLayer}-${zoom >= PARCEL_NUMBERS_MIN_ZOOM}`}
            url="https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"
            layers={zoom >= PARCEL_NUMBERS_MIN_ZOOM ? 'dzialki,numery_dzialek' : 'dzialki'}
            format="image/png"
            transparent
            opacity={0.9}
            maxZoom={19}
            className={baseLayer === 'orto' ? 'kieg-on-photo' : 'kieg-on-map'}
            attribution="GUGiK KIEG"
          />
        )}

        {/* Agricultural fields that can be picked: subtle tint, neon on hover */}
        {interactive && fields.length > 0 && (
          <Pane name="fieldsPane" style={{ zIndex: 402 }}>
            {fields.map((f) => (
              <Polygon
                key={`field-${f.id}`}
                positions={f.rings}
                pathOptions={baseLayer === 'orto' ? FIELD_STYLE_PHOTO : FIELD_STYLE_MAP}
                eventHandlers={{
                  mouseover: (e) => e.target.setStyle(FIELD_HOVER_STYLE),
                  mouseout: (e) => e.target.setStyle(baseLayer === 'orto' ? FIELD_STYLE_PHOTO : FIELD_STYLE_MAP),
                }}
              />
            ))}
          </Pane>
        )}

        {/* Ditches / streams across the visible area */}
        {viewWater.length > 0 && (
          <Pane name="viewWaterPane" style={{ zIndex: 405 }}>
            {viewWater.map((f) => (
              <Polyline
                key={`vw-${f.id}`}
                positions={f.line}
                pathOptions={{
                  color: WATER,
                  weight: f.kind === 'river' || f.kind === 'canal' ? 3.5 : 2.5,
                  opacity: 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                interactive={false}
              />
            ))}
          </Pane>
        )}

        <Pane name={DROUGHT_PANE} style={{ zIndex: 210 }}>
          {showDrought && edoReady && (
            <WMSTileLayer
              key={`edo-${edoTime ?? 'default'}-${edoAttempt}`}
              url={EDO_WMS_URL}
              layers={EDO_LAYER}
              format="image/png"
              transparent
              opacity={0.56}
              tileSize={EDO_TILE_SIZE}
              maxNativeZoom={EDO_MAX_NATIVE_ZOOM}
              // the EDO server is case-sensitive: Leaflet's default lower-case "service=…&request=…" gets
              // HTTP 400 (an HTML page that Chrome blocks as ERR_BLOCKED_BY_ORB), so every tile used to fail
              uppercase
              maxZoom={19}
              // TIME must be an exact dekad (1st / 11th / 21st) or the server answers 400 for every tile
              params={edoParams}
              attribution="Copernicus EDO"
              eventHandlers={edoEvents}
            />
          )}
        </Pane>

        {selectedPoint && !selectionOutline && !polygon && (
          <Marker position={[selectedPoint.lat, selectedPoint.lon]} icon={SELECTED_PIN_ICON} />
        )}

        {/* Ditches / streams around the parcel */}
        {water && water.features.length > 0 && (
          <Pane name="waterPane" style={{ zIndex: 410 }}>
            {water.features.map((f) => (
              <Polyline
                key={`case-${f.id}`}
                positions={f.line}
                pathOptions={{ color: '#FFFFFF', weight: 6.5, opacity: 0.55, lineCap: 'round', lineJoin: 'round' }}
                interactive={false}
              />
            ))}
            {water.features.map((f) => (
              <Polyline
                key={`water-${f.id}`}
                positions={f.line}
                pathOptions={{
                  color: WATER,
                  weight: nearest && nearest.feature.id === f.id ? 4 : 3,
                  opacity: 0.95,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                interactive={false}
              />
            ))}
            {nearest && nearest.distM > 1 && (
              <Polyline
                positions={[nearest.parcelPoint, nearest.linePoint]}
                pathOptions={{ color: '#FFFFFF', weight: 2.5, opacity: 0.95, dashArray: '2 7', lineCap: 'round' }}
                interactive={false}
              />
            )}
          </Pane>
        )}

        {/* Parcel fill: translucent cyan + diagonal hatch */}
        {focus && (
          <GeoJSON
            key={`fill-${focusKey}-${warnTone}`}
            data={focus as GeoJSON.GeoJsonObject}
            style={() =>
              warnTone
                ? { stroke: false, fillColor: WARN, fillOpacity: 0.18 }
                : { stroke: false, fillColor: `url(#${HATCH_ID})`, fillOpacity: 1 }
            }
            interactive={false}
          />
        )}

        {/* Neon outline in its own pane so only the outline gets the glow filter */}
        {focus && (
          // key: react-leaflet creates a pane once, so a new name needs a new Pane (no neon glow on the warning)
          <Pane key={warnTone ? 'warn' : 'glow'} name={warnTone ? 'parcelWarn' : 'parcelGlow'} style={{ zIndex: 420 }}>
            <GeoJSON
              key={`outline-${focusKey}-${warnTone}`}
              data={focus as GeoJSON.GeoJsonObject}
              style={() =>
                warnTone
                  ? { color: WARN, weight: 3.5, opacity: 1, fill: false, dashArray: '8 6', lineJoin: 'round' }
                  : { color: NEON, weight: 4, opacity: 1, fill: false, lineJoin: 'round' }
              }
              interactive={false}
            />
          </Pane>
        )}

        {nearest && (
          <>
            <CircleMarker
              center={nearest.linePoint}
              radius={7}
              pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: WATER, fillOpacity: 1 }}
              interactive={false}
            />
            {waterTag && <Marker position={nearest.linePoint} icon={waterTag} interactive={false} keyboard={false} />}
          </>
        )}

        {arrows.map((a, i) => (
          <Marker key={`arrow-${i}`} position={a.pos} icon={a.icon} interactive={false} keyboard={false} />
        ))}

        {tagPoint && tagIcon && <Marker position={tagPoint} icon={tagIcon} interactive={false} keyboard={false} zIndexOffset={1000} />}

        <MapClickHandler
          enabled={interactive}
          onSelect={onSelectPoint}
          onZoomChange={setZoom}
          onNotice={showNotice}
          onViewChange={onViewChange}
        />
        <ViewportContext enabled={showViewportWater} onChange={handleViewContext} />
        <DevMapHandle interactive={interactive} />
        <PolandClip />
        <MapRef mapRef={mapRef} />
        {/* ditches / fields come from OSM even over the aerial photo, so credit OSM whenever they are drawn */}
        {baseLayer !== 'osm' && (viewWater.length > 0 || fields.length > 0 || (water?.features.length ?? 0) > 0) && (
          <ExtraAttribution text={OSM_OVERLAY_ATTRIBUTION} />
        )}
        {arrows.length > 0 && <ExtraAttribution text={OPEN_METEO_ATTRIBUTION} />}
        {interactive && <MapShortcuts t={t} reserveTopRight={reserveTopRight} />}
        <FitPolygonBounds
          polygon={focus}
          padLeft={padLeft}
          extraPoint={nearest ? nearest.linePoint : null}
        />
      </MapContainer>

      {/* Map instruction pill */}
      {interactive && (
        <div className={`pointer-events-none absolute left-3 right-16 top-3 z-[400] flex justify-start sm:left-4 sm:top-4 ${overlayOffsetClass}`}>
          <div
            aria-live="polite"
            className={`glass-pill flex items-center gap-2 px-3 py-2 text-xs font-medium leading-snug sm:gap-2.5 sm:px-4 sm:py-2.5 sm:text-sm ${
              selectionTone === 'warn' && selectionOutline ? 'notice-warn' : ''
            }`}
          >
            {selectionLoading || (viewStatus === 'loading' && fields.length === 0 && zoom >= PICK_MIN_ZOOM) ? (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: NEON }} />
            ) : (
              <Navigation className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" style={{ color: 'var(--brand-primary)' }} />
            )}
            {hintText}
          </div>
        </div>
      )}

      {/* Zoom hint for cadastral parcels */}
      {showParcels && zoom < PARCELS_MIN_ZOOM && (
        <div className={`pointer-events-none absolute bottom-24 left-4 right-4 z-[400] hidden justify-start sm:flex ${overlayOffsetClass}`}>
          <div className="glass-panel px-3.5 py-2 text-sm font-medium">{t.zoomInForParcels}</div>
        </div>
      )}

      {/* Legend for the highlighted parcel overlays */}
      {(showLegend || showDrought) && (
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          aria-controls="map-legend"
          className="glass-pill no-print absolute bottom-[66px] right-3 z-[401] inline-flex min-h-[36px] items-center gap-1.5 px-3 text-xs font-semibold sm:hidden"
        >
          {showDrought && (
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${edoStatus === 'loading' ? 'animate-pulse' : ''}`}
              style={{
                backgroundColor:
                  edoStatus === 'error' || edoStatus === 'partial'
                    ? 'var(--warn-icon)'
                    : edoStatus === 'loading'
                      ? 'var(--ink-muted)'
                      : 'var(--brand-primary)',
              }}
            />
          )}
          {t.legendToggle}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${legendOpen ? '' : 'rotate-180'}`} aria-hidden="true" />
        </button>
      )}
      {(showLegend || showDrought) && (
        <div
          id="map-legend"
          className={`glass-panel no-print panel-scroll absolute bottom-[110px] right-3 z-[400] max-h-[45%] w-[calc(100%-1.5rem)] max-w-[300px] flex-col gap-2 overflow-y-auto px-3.5 py-3 text-xs sm:bottom-24 sm:flex sm:max-h-none sm:w-auto sm:max-w-[280px] sm:overflow-visible ${
            legendOpen ? 'flex' : 'hidden'
          }`}
        >
          {showLegend && (
            <>
              {focus && (
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className="legend-swatch-parcel" />
                  {t.legendParcel}
                </span>
              )}
              {showFields && (
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className="legend-swatch-field" />
                  {t.legendFields}
                </span>
              )}
              {showParcels && zoom < PARCELS_MIN_ZOOM && (
                <span className="leading-snug sm:hidden" style={{ color: 'var(--ink-secondary)' }}>
                  {t.zoomInForParcels}
                </span>
              )}
              {showBounds && (
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className={baseLayer === 'orto' ? 'legend-swatch-bounds' : 'legend-swatch-bounds legend-swatch-bounds--map'} />
                  {t.legendBounds}
                </span>
              )}
              {hasWater && (
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className="h-[3px] w-5 rounded-full" style={{ backgroundColor: WATER }} />
                  {t.legendWater}
                </span>
              )}
              {arrows.length > 0 && (
                <span className="flex items-center gap-2 font-medium" title={t.runoffNote}>
                  <svg width="16" height="16" viewBox="0 0 26 26" aria-hidden="true">
                    <path d="M13 3 L19 12 L15 12 L15 23 L11 23 L11 12 L7 12 Z" fill="#00B8D4" />
                  </svg>
                  {t.legendRunoff}
                </span>
              )}
            </>
          )}
          {showDrought && (
            <div
              className={showLegend ? 'mt-1 border-t pt-2' : ''}
              style={{ borderColor: 'var(--hairline)' }}
              data-testid="edo-legend"
              data-status={edoStatus}
            >
              <p className="font-semibold">{t.edoLegendTitle}</p>
              <p aria-live="polite" className="mt-1 flex items-start gap-1.5 leading-snug" style={{ color: edoStatus === 'error' || edoStatus === 'partial' ? 'var(--warn-ink)' : 'var(--ink-secondary)' }}>
                {edoStatus === 'loading' && <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
                {(edoStatus === 'error' || edoStatus === 'partial') && (
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: 'var(--warn-icon)' }} aria-hidden="true" />
                )}
                <span>
                  {edoStatus === 'loading' && t.edoLoading}
                  {edoStatus === 'error' && t.edoUnavailable}
                  {edoStatus === 'partial' && t.edoPartial}
                  {edoStatus === 'ok' &&
                    (edoTime ? (
                      <>
                        {t.edoAsOf}: <strong className="num">{edoTime}</strong>
                        {droughtDate ? ` (${t.edoForDate})` : ` (${t.edoLatest})`}
                      </>
                    ) : (
                      t.edoLatest
                    ))}
                </span>
              </p>
              {/* swatches use the exact colours of the EDO "cdiad" tiles (GetLegendGraphic: Watch / Warning / Alert) */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--ink-secondary)' }}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f0e442' }} />
                  {t.edoLegendWatch}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#e69f00' }} />
                  {t.edoLegendWarning}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#dc050c' }} />
                  {t.edoLegendAlert}
                </span>
              </div>
              {edoStatus === 'error' && (
                <button
                  type="button"
                  className="chip mt-1.5"
                  onClick={() => {
                    setEdoTiles({ loading: true, loaded: 0, failed: 0 });
                    setEdoAttempt((n) => n + 1);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.retryButton}
                </button>
              )}
              {edoStatus !== 'error' && (
                <p className="mt-1.5 leading-snug" style={{ color: 'var(--ink-muted)' }}>
                  {t.edoNoColour}
                </p>
              )}
              {edoStatus !== 'error' && zoom >= EDO_COARSE_ZOOM && (
                <div className="mt-2 rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
                  <p className="leading-snug" style={{ color: 'var(--ink-secondary)' }}>
                    {t.edoCoarse}
                  </p>
                  <button
                    type="button"
                    className="chip mt-1.5"
                    onClick={() => {
                      const map = mapRef.current;
                      if (map) map.flyTo(map.getCenter(), EDO_COARSE_ZOOM - 2, { duration: 0.8 });
                    }}
                  >
                    <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.edoZoomOut}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Phones: map data credits collapsed behind an "i" button (licences still require them on demand) */}
      <button
        type="button"
        onClick={() => setAttrOpen((v) => !v)}
        aria-expanded={attrOpen}
        aria-label={t.mapSources}
        title={t.mapSources}
        className="glass-pill no-print absolute bottom-[66px] left-3 z-[401] flex h-9 w-9 items-center justify-center sm:hidden"
      >
        <Info className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      </button>

      {/* Floating layer dock */}
      <div className={`no-print absolute bottom-3 left-3 right-3 z-[400] flex items-center sm:bottom-5 sm:left-4 sm:right-4 lg:right-auto ${overlayOffsetClass}`}>
        <div
          role="toolbar"
          aria-label="Warstwy mapy"
          className="glass-panel no-scrollbar inline-flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto p-1 sm:flex-wrap sm:p-1.5"
        >
          {(
            [
              { key: 'osm', label: t.layerMap, short: t.layerMap, Icon: MapIcon, pressed: baseLayer === 'osm', onClick: () => pickBase('osm') },
              { key: 'orto', label: t.layerOrto, short: t.layerOrtoShort, Icon: Layers, pressed: baseLayer === 'orto', onClick: () => pickBase('orto') },
              null,
              {
                key: 'parcels',
                label: t.layerParcels,
                short: t.layerParcelsShort,
                Icon: Grid2x2,
                pressed: showParcels,
                onClick: () => setShowParcels((v) => !v),
              },
              {
                key: 'edo',
                label: t.layerDrought,
                short: t.layerDroughtShort,
                Icon: CloudRain,
                pressed: showDrought,
                onClick: () =>
                  setShowDrought((v) => {
                    if (!v) setLegendOpen(true); // show the drought status right away on phones
                    return !v;
                  }),
              },
            ] as const
          ).map((item, idx) =>
            item === null ? (
              <span key={`sep-${idx}`} aria-hidden="true" className="mx-0.5 hidden h-5 w-px sm:inline-block" style={{ backgroundColor: 'var(--hairline)' }} />
            ) : (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                aria-pressed={item.pressed}
                // full name for screen readers / tests; phones show the short label so all four fit
                aria-label={item.label}
                className="layer-btn inline-flex min-h-[38px] shrink-0 items-center gap-1.5 px-2.5 text-xs font-semibold sm:min-h-[36px] sm:px-3 sm:text-sm"
              >
                <item.Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
