/** Exact 1:1 mirror of WodoPlon ASP.NET Core API contract (docs/api.md & backend DTOs) */

export type WaterDeficitLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type RetentionType = 'LANDSCAPE' | 'SOIL';

export type SatelliteStatus = 'OK' | 'CLOUDY_FALLBACK' | 'NO_DATA' | 'ERROR';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type ParcelGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface CropResponse {
  id: string;
  namePl: string;
  kcMid: number;
  criticalMonths: number[];
  rootDepthCm: number;
}

export interface AnalyzeParcelRequest {
  dzialkaId: string | null;
  lat: number | null;
  lon: number | null;
  cropId: string;
  targetDate: string; // YYYY-MM-DD
}

export interface ParcelInfoResponse {
  dzialkaId: string;
  voivodeship: string | null;
  areaHa: number;
  cropId: string;
  cropNamePl: string;
  targetDate: string;
  polygonGeoJson: ParcelGeometry;
}

export interface DiagnosisMetrics {
  precip90dMm: number;
  precip10yrAvg90dMm: number | null;
  waterBalanceMm: number;
  drySpellDays: number;
  historicalDroughtYears: number;
  ndviMean: number | null;
  ndwiMean: number | null;
  slopeDeg: number | null;
  sandPct: number | null;
  nearestWaterDistM: number | null;
}

export interface DiagnosisResponse {
  riskLevel: WaterDeficitLevel;
  summaryPl: string;
  historicalContextPl: string;
  metrics: DiagnosisMetrics;
}

export interface RetentionMeasure {
  type: RetentionType;
  title: string;
  description: string;
}

export interface CausesAndRetentionResponse {
  causesPl: string[];
  retentionRecommendationsPl: RetentionMeasure[];
}

export interface IrrigationAdvice {
  isRecommended: boolean;
  advicePl: string;
  doseMm: number | null;
}

export interface SourcesAndLimitationsResponse {
  sources: string[];
  limitationsPl: string[];
  satelliteStatus: SatelliteStatus;
}

export interface AnalysisResponse {
  reportUuid: string;
  parcelInfo: ParcelInfoResponse;
  step1_diagnosis: DiagnosisResponse;
  step2_causesAndRetention: CausesAndRetentionResponse;
  step3_irrigation: IrrigationAdvice;
  step4_sourcesAndLimitations: SourcesAndLimitationsResponse;
}

export interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  errors?: Record<string, string[]>;
}
