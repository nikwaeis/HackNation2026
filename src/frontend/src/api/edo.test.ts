import { describe, expect, it } from 'vitest';
import { dekadOf, edoTimeFor, parseLatestDekad } from './edo';

/** Trimmed from the live GetCapabilities (2026-11-21) */
const CAPS = `<?xml version="1.0"?><WMS_Capabilities><Capability><Layer>
<Layer queryable="1"><Name>other</Name><Dimension name="time" units="ISO8601" nearestValue="0" default="2026-10-01">1995-01-01/2026-10-01/P10D</Dimension></Layer>
<Layer queryable="1"><Name>cdiad</Name><Title>Combined Drought Indicator (CDI) v4.1</Title>
<CRS>EPSG:3857</CRS>
<Dimension name="time" units="ISO8601" nearestValue="0" default="2026-11-01">2012-01-01/2026-11-01/P10D</Dimension>
</Layer></Layer></Capability></WMS_Capabilities>`;

describe('dekadOf — the EDO server only accepts the 1st, 11th and 21st (anything else is HTTP 400)', () => {
  it.each([
    ['2026-11-21', '2026-11-21'],
    ['2026-11-30', '2026-11-21'],
    ['2026-11-20', '2026-11-11'],
    ['2026-11-11', '2026-11-11'],
    ['2026-11-10', '2026-11-01'],
    ['2025-07-15', '2025-07-11'],
    ['2024-02-29', '2024-02-21'],
  ])('%s → %s', (date, dekad) => {
    expect(dekadOf(date)).toBe(dekad);
  });
});

describe('edoTimeFor', () => {
  it('home page: latest available dekad', () => {
    expect(edoTimeFor(null, '2026-11-01')).toBe('2026-11-01');
  });

  it('report: dekad of the analysis date', () => {
    expect(edoTimeFor('2025-07-15', '2026-11-01')).toBe('2025-07-11');
  });

  it('analysis today, current dekad not published yet → latest published dekad', () => {
    expect(edoTimeFor('2026-11-21', '2026-11-01')).toBe('2026-11-01');
  });

  it('date before the CDI archive → first dekad', () => {
    expect(edoTimeFor('2010-05-05', '2026-11-01')).toBe('2012-01-01');
  });

  it('service did not answer: home lets the server pick its default, report still snaps to a dekad', () => {
    expect(edoTimeFor(null, null)).toBeNull();
    expect(edoTimeFor('2025-07-15', null)).toBe('2025-07-11');
  });
});

describe('parseLatestDekad', () => {
  it('reads the default of the cdiad layer, not of other layers', () => {
    expect(parseLatestDekad(CAPS)).toBe('2026-11-01');
  });

  it('falls back to the end of the time range when there is no default', () => {
    expect(parseLatestDekad(CAPS.replace(' default="2026-11-01"', ''))).toBe('2026-11-01');
  });

  it('returns null when the layer is missing', () => {
    expect(parseLatestDekad('<WMS_Capabilities/>')).toBeNull();
  });
});
