import type { MultiPolygon, Polygon } from 'geojson';

/** GET /api/crops (extra fields such as kcMid / rootDepthCm are ignored) */
export interface Crop {
  id: string;
  namePl: string;
  criticalMonths: number[];
}

/** POST /api/analyze — body */
export interface AnalyzeRequest {
  dzialkaId: string | null;
  lat: number | null;
  lon: number | null;
  cropId: string;
  targetDate: string; // YYYY-MM-DD
}

/*
 * View model used by the UI. The API response (docs/api.md §3.2: parcelInfo / step1_diagnosis / ...)
 * and the older contract example (meta / step1_WaterAssessment / ...) are both mapped onto it
 * in api/normalize.ts. Fields the backend does not send are null and simply not rendered.
 */

export type DeficitLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type SourceMode = 'LIVE' | 'CACHED';
export type SatelliteStatus = 'OK' | 'CLOUDY_FALLBACK' | 'NO_DATA';

export interface ReportMeta {
  dzialkaId: string;
  voivodeship: string | null;
  areaHa: number | null;
  cropId: string;
  cropNamePl: string;
  targetDate: string;
  generatedAt: string | null;
  fromCache: boolean;
}

export interface WaterMetrics {
  precip30dMm: number | null;
  precip90dMm: number | null;
  precip10yrAvg90dMm: number | null;
  /** Water the crop/soil lost in the same 90 days (ETc, or ET0 in the older contract) */
  waterNeed90dMm: number | null;
  /** Rain minus water need over 90 days; negative = deficit */
  waterBalanceMm: number | null;
  drySpellDays: number | null;
  historicalDroughtYears: number | null;
  ndviMean: number | null;
  ndwiMean: number | null;
  slopeDeg: number | null;
  sandPct: number | null;
  nearestWaterDistM: number | null;
}

export interface WaterAssessment {
  deficitLevel: DeficitLevel;
  summaryPl: string;
  historicalRiskPl: string;
  metrics: WaterMetrics;
}

export interface Cause {
  code: string;
  titlePl: string;
  descriptionPl: string | null;
}

export interface Recommendation {
  actionPl: string;
  justificationPl: string | null;
  priority: Priority | null;
}

export interface CausesAndRetention {
  identifiedCauses: Cause[];
  landscapeRetentionRecommendations: Recommendation[];
  soilAndAgroRecommendations: Recommendation[];
}

export interface Irrigation {
  isRecommended: boolean;
  /** LOW | MODERATE | HIGH | CRITICAL when provided */
  urgency: string | null;
  advicePl: string;
  doseMm: number | null;
  waterSourceNotePl: string | null;
}

export interface DataSource {
  name: string;
  date: string | null;
  mode: SourceMode | null;
}

export interface SourcesAndLimitations {
  sources: DataSource[];
  limitationsPl: string[];
  satelliteStatus: SatelliteStatus | null;
}

export interface AnalysisReport {
  reportUuid: string;
  meta: ReportMeta;
  geometry: Polygon | MultiPolygon | null;
  step1_WaterAssessment: WaterAssessment;
  step2_CausesAndRetention: CausesAndRetention;
  step3_Irrigation: Irrigation;
  step4_SourcesAndLimitations: SourcesAndLimitations;
}
