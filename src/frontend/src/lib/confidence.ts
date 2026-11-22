import type { AnalysisResponse } from '../types/api';

/*
 * "Poziom niepewności wyniku" (KOWR task 3.3.5, Podstawy naukowe: "wskazywać poziom niepewności wyników").
 *
 * The backend does not return an uncertainty figure, so the report derives an honest, transparent
 * indicator from the COMPLETENESS of the inputs actually used — not a statistical confidence interval:
 *  - satellite indices: the KOWR materials stress they must not be read alone, but without them the
 *    assessment rests on weather + soil models only;
 *  - the 10-year rainfall normal: without it the current deficit cannot be compared with the history;
 *  - soil texture, slope, distance to water: inputs of the causes and the retention recommendations.
 * Every point taken off is listed as a reason, so the farmer sees why.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ConfidenceReason =
  | 'satelliteMissing'
  | 'satelliteCloudy'
  | 'normMissing'
  | 'soilMissing'
  | 'slopeMissing'
  | 'waterMissing';

export interface Confidence {
  level: ConfidenceLevel;
  /** 0..1, share of the input weight that was available */
  score: number;
  reasons: ConfidenceReason[];
}

const missing = (v: number | null | undefined) => v === null || v === undefined || Number.isNaN(v);

export function assessConfidence(report: AnalysisResponse): Confidence {
  const m = report.step1_diagnosis.metrics;
  const sat = report.step4_sourcesAndLimitations.satelliteStatus;
  const reasons: ConfidenceReason[] = [];
  // weights reflect how much each input drives the diagnosis (weather balance itself is always present)
  let lost = 0;

  if (sat === 'NO_DATA' || sat === 'ERROR' || (missing(m.ndviMean) && missing(m.ndwiMean))) {
    reasons.push('satelliteMissing');
    lost += 0.25;
  } else if (sat === 'CLOUDY_FALLBACK') {
    reasons.push('satelliteCloudy');
    lost += 0.1;
  }
  if (missing(m.precip10yrAvg90dMm)) {
    reasons.push('normMissing');
    lost += 0.25;
  }
  if (missing(m.sandPct)) {
    reasons.push('soilMissing');
    lost += 0.15;
  }
  if (missing(m.slopeDeg)) {
    reasons.push('slopeMissing');
    lost += 0.1;
  }
  if (missing(m.nearestWaterDistM)) {
    reasons.push('waterMissing');
    lost += 0.05;
  }

  const score = Math.max(0, Math.round((1 - lost) * 100) / 100);
  const level: ConfidenceLevel = score >= 0.85 ? 'high' : score >= 0.6 ? 'medium' : 'low';
  return { level, score, reasons };
}
