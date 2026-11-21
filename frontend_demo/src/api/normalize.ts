import type { MultiPolygon, Polygon } from 'geojson';
import type {
  AnalysisReport,
  Cause,
  DataSource,
  DeficitLevel,
  Priority,
  Recommendation,
  SatelliteStatus,
  WaterMetrics,
} from './types';

/*
 * Maps an API report onto the UI view model. Two wire formats are accepted:
 *  - backend (docs/api.md §3.2): parcelInfo, step1_diagnosis, step2_causesAndRetention { causesPl[], retentionRecommendationsPl[] },
 *    step3_irrigation, step4_sourcesAndLimitations { sources: string[], satelliteStatus }
 *  - older contract example (api_asp_net_core_python_fastapi.md §1.2): meta, step1_WaterAssessment, ... — used by the demo mode
 */

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const bool = (v: unknown): boolean => v === true || v === 'true';
const upper = (v: unknown): string | null => str(v)?.trim().toUpperCase().replace(/[\s-]+/g, '_') ?? null;

function level(v: unknown): DeficitLevel {
  const u = upper(v);
  if (u === 'LOW' || u === 'MODERATE' || u === 'HIGH' || u === 'CRITICAL') return u;
  if (u === 'MEDIUM') return 'MODERATE';
  return 'MODERATE';
}

function priority(v: unknown): Priority | null {
  const u = upper(v);
  if (u === 'HIGH' || u === 'MEDIUM' || u === 'LOW') return u;
  if (u === 'MODERATE') return 'MEDIUM';
  return null;
}

function satelliteStatus(v: unknown): SatelliteStatus | null {
  const u = upper(v);
  return u === 'OK' || u === 'CLOUDY_FALLBACK' || u === 'NO_DATA' ? u : null;
}

function geometry(v: unknown): Polygon | MultiPolygon | null {
  const g = obj(v);
  if (!g || !Array.isArray(g.coordinates)) return null;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g as unknown as Polygon | MultiPolygon;
  return null;
}

function metrics(m: Obj | null): WaterMetrics {
  const precip90 = num(m?.precip90dMm);
  const balance = num(m?.waterBalanceMm);
  // backend: balance = P − ETc, so the crop's water need is P − balance
  const need = num(m?.et0_90dMm) ?? num(m?.etc90dMm) ?? (precip90 != null && balance != null ? precip90 - balance : null);
  return {
    precip30dMm: num(m?.precip30dMm),
    precip90dMm: precip90,
    precip10yrAvg90dMm: num(m?.precip10yrAvg90dMm),
    waterNeed90dMm: need != null ? Math.round(need * 10) / 10 : null,
    waterBalanceMm: balance,
    drySpellDays: num(m?.drySpellDays),
    historicalDroughtYears: num(m?.historicalDroughtYears),
    ndviMean: num(m?.ndviMean),
    ndwiMean: num(m?.ndwiMean),
    slopeDeg: num(m?.slopeDeg),
    sandPct: num(m?.sandPct),
    nearestWaterDistM: num(m?.nearestWaterDistM),
  };
}

function recommendation(v: unknown): Recommendation | null {
  if (typeof v === 'string') return str(v) ? { actionPl: v, justificationPl: null, priority: null } : null;
  const o = obj(v);
  if (!o) return null;
  const action = str(o.actionPl) ?? str(o.title) ?? str(o.titlePl);
  if (!action) return null;
  return {
    actionPl: action,
    justificationPl: str(o.justificationPl) ?? str(o.description) ?? str(o.descriptionPl),
    priority: priority(o.priority),
  };
}

function cause(v: unknown, i: number): Cause | null {
  if (typeof v === 'string') return str(v) ? { code: `cause-${i}`, titlePl: v, descriptionPl: null } : null;
  const o = obj(v);
  const title = str(o?.titlePl) ?? str(o?.title);
  if (!o || !title) return null;
  return { code: str(o.code) ?? `cause-${i}`, titlePl: title, descriptionPl: str(o.descriptionPl) ?? str(o.description) };
}

function source(v: unknown): DataSource | null {
  if (typeof v === 'string') return str(v) ? { name: v, date: null, mode: null } : null;
  const o = obj(v);
  const name = str(o?.name);
  if (!o || !name) return null;
  const mode = upper(o.mode);
  return { name, date: str(o.date), mode: mode === 'LIVE' || mode === 'CACHED' ? mode : null };
}

const notNull = <T,>(x: T | null): x is T => x !== null;

export function normalizeReport(raw: unknown): AnalysisReport {
  const r = obj(raw);
  if (!r) throw new Error('Report is not an object');

  const meta = obj(r.parcelInfo) ?? obj(r.meta) ?? {};
  const s1 = obj(r.step1_diagnosis) ?? obj(r.step1_WaterAssessment) ?? {};
  const s2 = obj(r.step2_causesAndRetention) ?? obj(r.step2_CausesAndRetention) ?? {};
  const s3 = obj(r.step3_irrigation) ?? obj(r.step3_Irrigation) ?? {};
  const s4 = obj(r.step4_sourcesAndLimitations) ?? obj(r.step4_SourcesAndLimitations) ?? {};

  // Step 2: either one typed list (LANDSCAPE / SOIL) or two separate lists
  let landscape = arr(s2.landscapeRetentionRecommendations).map(recommendation).filter(notNull);
  let soil = arr(s2.soilAndAgroRecommendations).map(recommendation).filter(notNull);
  for (const item of arr(s2.retentionRecommendationsPl)) {
    const rec = recommendation(item);
    if (!rec) continue;
    const type = upper(obj(item)?.type);
    if (type === 'SOIL' || type === 'AGRO' || type === 'SOIL_AND_AGRO') soil = [...soil, rec];
    else landscape = [...landscape, rec];
  }

  const causesRaw = Array.isArray(s2.causesPl) ? s2.causesPl : arr(s2.identifiedCauses);

  return {
    reportUuid: str(r.reportUuid) ?? '',
    meta: {
      dzialkaId: str(meta.dzialkaId) ?? '—',
      voivodeship: str(meta.voivodeship),
      areaHa: num(meta.areaHa),
      cropId: str(meta.cropId) ?? '',
      cropNamePl: str(meta.cropNamePl) ?? str(meta.cropId) ?? '—',
      targetDate: str(meta.targetDate) ?? '',
      generatedAt: str(meta.generatedAt) ?? str(r.generatedAt),
      fromCache: bool(meta.fromCache),
    },
    geometry: geometry(meta.polygonGeoJson) ?? geometry(r.geometry),
    step1_WaterAssessment: {
      deficitLevel: level(s1.riskLevel ?? s1.deficitLevel),
      summaryPl: str(s1.summaryPl) ?? '',
      historicalRiskPl: str(s1.historicalContextPl) ?? str(s1.historicalRiskPl) ?? '',
      metrics: metrics(obj(s1.metrics)),
    },
    step2_CausesAndRetention: {
      identifiedCauses: causesRaw.map(cause).filter(notNull),
      landscapeRetentionRecommendations: landscape,
      soilAndAgroRecommendations: soil,
    },
    step3_Irrigation: {
      isRecommended: bool(s3.isRecommended),
      urgency: upper(s3.urgency),
      advicePl: str(s3.advicePl) ?? '',
      doseMm: num(s3.doseMm),
      waterSourceNotePl: str(s3.waterSourceNotePl),
    },
    step4_SourcesAndLimitations: {
      sources: arr(s4.sources).map(source).filter(notNull),
      limitationsPl: arr(s4.limitationsPl).map(str).filter(notNull),
      satelliteStatus: satelliteStatus(s4.satelliteStatus) ?? satelliteStatus(s1.satelliteStatus),
    },
  };
}
