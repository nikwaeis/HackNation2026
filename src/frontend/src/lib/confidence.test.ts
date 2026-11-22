import { describe, expect, it } from 'vitest';
import { assessConfidence } from './confidence';
import { SAMPLE_DEMO_REPORT } from '../api/mockData';
import type { AnalysisResponse } from '../types/api';

function withMetrics(
  metrics: Partial<AnalysisResponse['step1_diagnosis']['metrics']>,
  satelliteStatus: AnalysisResponse['step4_sourcesAndLimitations']['satelliteStatus'] = 'OK',
): AnalysisResponse {
  return {
    ...SAMPLE_DEMO_REPORT,
    step1_diagnosis: {
      ...SAMPLE_DEMO_REPORT.step1_diagnosis,
      metrics: { ...SAMPLE_DEMO_REPORT.step1_diagnosis.metrics, ...metrics },
    },
    step4_sourcesAndLimitations: { ...SAMPLE_DEMO_REPORT.step4_sourcesAndLimitations, satelliteStatus },
  };
}

describe('assessConfidence — completeness of the inputs, shown as the uncertainty level', () => {
  it('all inputs present → high, no reasons', () => {
    expect(assessConfidence(SAMPLE_DEMO_REPORT)).toEqual({ level: 'high', score: 1, reasons: [] });
  });

  it('cloudy satellite scene only → still high, but the reason is listed', () => {
    const c = assessConfidence(withMetrics({}, 'CLOUDY_FALLBACK'));
    expect(c.level).toBe('high');
    expect(c.reasons).toEqual(['satelliteCloudy']);
  });

  it('no satellite scene → medium', () => {
    const c = assessConfidence(withMetrics({ ndviMean: null, ndwiMean: null }, 'NO_DATA'));
    expect(c.level).toBe('medium');
    expect(c.reasons).toEqual(['satelliteMissing']);
  });

  it('no satellite and no 10-year normal → low', () => {
    const c = assessConfidence(withMetrics({ ndviMean: null, ndwiMean: null, precip10yrAvg90dMm: null }, 'NO_DATA'));
    expect(c.level).toBe('low');
    expect(c.reasons).toEqual(['satelliteMissing', 'normMissing']);
  });

  it('satellite status OK but indices missing is treated as missing (no false precision)', () => {
    expect(assessConfidence(withMetrics({ ndviMean: null, ndwiMean: null }, 'OK')).reasons).toContain('satelliteMissing');
  });

  it('missing soil, slope and water distance are each reported', () => {
    const c = assessConfidence(withMetrics({ sandPct: null, slopeDeg: null, nearestWaterDistM: null }));
    expect(c.reasons).toEqual(['soilMissing', 'slopeMissing', 'waterMissing']);
    expect(c.level).toBe('medium');
  });
});
