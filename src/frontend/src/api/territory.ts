import { pointInFields, type FieldArea } from './mapContext';

/*
 * Light "what kind of land is this?" check for a picked parcel.
 *
 * ULDK GUGiK returns ANY cadastral parcel (house plots, yards, forest, roads…). After the lookup we ask the
 * national land register (EGiB) through GUGiK's KIEG WMS GetFeatureInfo at the exact clicked point: it returns
 * the land-use class ("Oznaczenie konturu / użytku", e.g. RIVa = arable, B = residential, Br = farmstead).
 * The service answers in ~0.3 s and sends `Access-Control-Allow-Origin: *`, so no proxy is needed.
 *
 * Not every county publishes the class. Then we fall back to OpenStreetMap farmland already loaded for the
 * visible map area. If nothing answers within the short budget the selection is NOT blocked
 * (verdict "unverified") — the UI only notes that it shows a cadastral parcel boundary.
 */

const KIEG_URL = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';
/** Short budget: the check must never hold up the farmer */
const CHECK_TIMEOUT_MS = 2_500;

export type TerritoryReason = 'builtUp' | 'farmyard' | 'forest' | 'water' | 'road' | 'wasteland' | 'notFarmland';

export type FieldKind = 'arable' | 'meadow' | 'pasture' | 'orchard' | 'farmland';

export type TerritoryVerdict =
  /** farm land (EGiB class R/Ł/Ps/S or OSM farmland) — or nothing suggests otherwise */
  | { kind: 'field'; source: 'egib' | 'osm'; field: FieldKind; code?: string }
  /** built-up or non-agricultural land — warn, let the farmer pick again or confirm */
  | { kind: 'warn'; reason: TerritoryReason; source: 'egib' | 'osm'; code?: string }
  /** no source answered in time — keep the ULDK result, add a short note */
  | { kind: 'unverified' };

/** EGiB land-use symbols, longest first so "Br" is not read as "B" and "Lzr" not as "Lz" */
const EGIB_PREFIXES: [string, TerritoryReason | FieldKind][] = [
  ['Lzr', 'forest'],
  ['Wsr', 'water'],
  ['Br', 'farmyard'],
  ['Ba', 'builtUp'],
  ['Bi', 'builtUp'],
  ['Bp', 'builtUp'],
  ['Bz', 'builtUp'],
  ['Ls', 'forest'],
  ['Lz', 'forest'],
  ['Ps', 'pasture'],
  ['Wp', 'water'],
  ['Ws', 'water'],
  ['Tk', 'road'],
  ['Ti', 'road'],
  ['Tp', 'road'],
  ['Tr', 'wasteland'],
  ['dr', 'road'],
  ['B', 'builtUp'],
  ['R', 'arable'],
  ['Ł', 'meadow'],
  ['S', 'orchard'],
  ['W', 'water'],
  ['N', 'wasteland'],
  ['K', 'wasteland'],
];

const FIELD_KINDS = new Set<string>(['arable', 'meadow', 'pasture', 'orchard']);
/** When a parcel has several non-agricultural classes, report the most relevant one */
const WARN_PRIORITY: TerritoryReason[] = ['builtUp', 'farmyard', 'water', 'forest', 'road', 'wasteland'];

/** "S-RIVa" → orchard, "Br-RIVa" → farmyard, "RIIIb" → arable */
export function classifyEgib(code: string): TerritoryReason | FieldKind | null {
  const first = code.trim().split(/[-\s/]/)[0];
  if (!first) return null;
  for (const [prefix, cls] of EGIB_PREFIXES) {
    if (first.startsWith(prefix)) return cls;
  }
  return null;
}

/** KIEG GetFeatureInfo (text/xml) → land-use symbol at the point, e.g. "RIVa" / "B" */
async function fetchEgibClass(lat: number, lon: number, signal: AbortSignal): Promise<string | null> {
  const d = 0.0005;
  // WMS 1.3.0 + EPSG:4326 → axis order lat,lon; the clicked point is the centre pixel (50, 50)
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'dzialki,uzytki,kontury',
    QUERY_LAYERS: 'dzialki,uzytki,kontury',
    CRS: 'EPSG:4326',
    BBOX: [lat - d, lon - d, lat + d, lon + d].map((v) => v.toFixed(7)).join(','),
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'text/xml',
    STYLES: '',
  });
  const res = await fetch(`${KIEG_URL}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`KIEG ${res.status}`);
  const xml = await res.text();
  const attr = (name: string) => {
    const m = new RegExp(`<Attribute Name="${name}">([^<]*)</Attribute>`).exec(xml);
    return m ? m[1].trim() : '';
  };
  // the contour (klasoużytek) is the most specific; some counties only fill one of the two
  return attr('Oznaczenie konturu') || attr('Oznaczenie użytku') || null;
}

export async function assessTerritory(
  point: { lat: number; lon: number },
  viewFields: FieldArea[] | null,
  signal: AbortSignal,
): Promise<TerritoryVerdict> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort, { once: true });

  let code: string | null = null;
  try {
    code = await fetchEgibClass(point.lat, point.lon, ctrl.signal);
  } catch (err) {
    if (signal.aborted) throw err;
    // timeout / network → fall through to the OSM fallback
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }

  if (code) {
    // a parcel with several contours comes back as a list ("RV,S/RV,PsV,Ls,…") — classify each entry
    const classes = code
      .split(',')
      .map((c) => classifyEgib(c))
      .filter((c): c is TerritoryReason | FieldKind => c !== null);
    const fieldClasses = classes.filter((c) => FIELD_KINDS.has(c)) as FieldKind[];
    const warnClasses = classes.filter((c) => !FIELD_KINDS.has(c)) as TerritoryReason[];
    const shown = code.length > 24 ? `${code.slice(0, 22)}…` : code;
    if (classes.length > 0 && warnClasses.length === 0) {
      return { kind: 'field', source: 'egib', field: fieldClasses[0], code: shown };
    }
    if (classes.length > 0 && fieldClasses.length === 0) {
      const reason = WARN_PRIORITY.find((r) => warnClasses.includes(r)) ?? warnClasses[0];
      return { kind: 'warn', reason, source: 'egib', code: shown };
    }
    // mixed parcel (fields + buildings/forest…): the type at the exact point is unknown → OSM fallback below
  }

  // No class from the register: use OSM farmland already loaded for the visible area
  if (viewFields && viewFields.length > 0) {
    return pointInFields(point.lat, point.lon, viewFields)
      ? { kind: 'field', source: 'osm', field: 'farmland' }
      : { kind: 'warn', reason: 'notFarmland', source: 'osm' };
  }

  // Land type unknown (no class in the register, no OSM data, or no answer in time): don't block, just note it
  return { kind: 'unverified' };
}
