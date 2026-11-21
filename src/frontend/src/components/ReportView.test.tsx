import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportView } from './ReportView';
import { translations } from '../i18n/translations';
import { SAMPLE_DEMO_REPORT } from '../api/mockData';
import type { AnalysisResponse } from '../types/api';

vi.mock('./ParcelMap', () => ({ ParcelMap: () => <div data-testid="map" /> }));

const t = translations.pl;

function renderReport(report: AnalysisResponse = SAMPLE_DEMO_REPORT, isDemo = false) {
  return render(<ReportView t={t} lang="pl" report={report} isDemo={isDemo} onBack={() => {}} />);
}

afterEach(() => vi.unstubAllGlobals());

describe('ReportView — KOWR report requirements (zadanie 3.2 / 3.3)', () => {
  it('shows the 4 stages in the mandated order: assessment → retention → irrigation → sources', () => {
    renderReport();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual([t.step1Title, t.step2Title, t.step3Title, t.step4Title]);
  });

  it('shows the deficit level, its causes and the data-based recommendations', () => {
    renderReport();
    expect(screen.getByText(t.riskLabels.HIGH)).toBeInTheDocument();
    for (const cause of SAMPLE_DEMO_REPORT.step2_causesAndRetention.causesPl) {
      expect(screen.getByText(cause)).toBeInTheDocument();
    }
    for (const m of SAMPLE_DEMO_REPORT.step2_causesAndRetention.retentionRecommendationsPl) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }
  });

  it('lists data sources with dates and the report limitations', () => {
    renderReport();
    for (const src of SAMPLE_DEMO_REPORT.step4_sourcesAndLimitations.sources) {
      expect(screen.getByText(src)).toBeInTheDocument();
    }
    for (const lim of SAMPLE_DEMO_REPORT.step4_sourcesAndLimitations.limitationsPl) {
      expect(screen.getByText(lim)).toBeInTheDocument();
    }
    expect(screen.getByTitle(t.dateLabel)).toHaveTextContent(SAMPLE_DEMO_REPORT.parcelInfo.targetDate);
  });

  it('missing data is stated plainly — no fake numbers (KOWR 3.3.5: "bez pozornej precyzji")', () => {
    const report: AnalysisResponse = {
      ...SAMPLE_DEMO_REPORT,
      step1_diagnosis: {
        ...SAMPLE_DEMO_REPORT.step1_diagnosis,
        metrics: {
          ...SAMPLE_DEMO_REPORT.step1_diagnosis.metrics,
          ndviMean: null,
          ndwiMean: null,
          slopeDeg: null,
          sandPct: null,
          nearestWaterDistM: null,
          precip10yrAvg90dMm: null,
        },
      },
      step4_sourcesAndLimitations: { ...SAMPLE_DEMO_REPORT.step4_sourcesAndLimitations, satelliteStatus: 'NO_DATA' },
    };
    const { container } = renderReport(report);
    expect(screen.getByText(t.satelliteWarningNoData)).toBeInTheDocument();
    expect(screen.getAllByText(t.unknownValue).length).toBeGreaterThanOrEqual(5);
    expect(container.textContent).not.toMatch(/NaN|undefined|null/);
  });

  it('retention measures carry priority badges derived from order + risk (HIGH: first two high)', () => {
    renderReport();
    const items = screen.getAllByRole('listitem').filter((li) => within(li).queryByText(/priorytet/i));
    expect(items.map((li) => within(li).getByText(/priorytet/i).textContent)).toEqual([
      t.priorityHigh,
      t.priorityHigh,
      t.priorityMedium,
    ]);
    expect(screen.getByText(t.priorityNote)).toBeInTheDocument();
  });

  it('shows the uncertainty level (Podstawy naukowe: "wskazywać poziom niepewności wyników")', () => {
    renderReport();
    expect(screen.getByTestId('confidence-chip')).toHaveTextContent('Wiarygodność oceny:wysoka');
    expect(screen.getByTestId('confidence-box')).toHaveAttribute('data-level', 'high');

    const noSat: AnalysisResponse = {
      ...SAMPLE_DEMO_REPORT,
      step1_diagnosis: {
        ...SAMPLE_DEMO_REPORT.step1_diagnosis,
        metrics: { ...SAMPLE_DEMO_REPORT.step1_diagnosis.metrics, ndviMean: null, ndwiMean: null, precip10yrAvg90dMm: null },
      },
      step4_sourcesAndLimitations: { ...SAMPLE_DEMO_REPORT.step4_sourcesAndLimitations, satelliteStatus: 'NO_DATA' },
    };
    renderReport(noSat);
    const boxes = screen.getAllByTestId('confidence-box');
    const box = boxes[boxes.length - 1];
    expect(box).toHaveAttribute('data-level', 'low');
    expect(box).toHaveTextContent('brak bezchmurnego zdjęcia satelitarnego');
    expect(box).toHaveTextContent('brak 10-letniej normy opadów');
  });

  it('retention is listed before agronomic measures (KOWR sequence)', () => {
    renderReport();
    const groups = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(groups).toEqual([t.retentionGroupLandscape, t.retentionGroupSoil]);
  });

  it('irrigation step shows the dose in mm and m³/ha', () => {
    renderReport();
    expect(screen.getByText(t.irrigationYes)).toBeInTheDocument();
    expect(screen.getByText('250 m³/ha')).toBeInTheDocument();
  });

  it('"Pobierz raport PDF" opens the print dialog (save as PDF)', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderReport();
    await userEvent.setup().click(screen.getAllByRole('button', { name: t.downloadPdf })[0]);
    expect(print).toHaveBeenCalledOnce();
  });

  it('"Kopiuj link" copies the shareable /report/{uuid} URL', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const report = { ...SAMPLE_DEMO_REPORT, reportUuid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' };
    renderReport(report);
    await user.click(screen.getAllByRole('button', { name: t.copyLinkShort })[0]);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/report/f47ac10b-58cc-4372-a567-0e02b2c3d479`);
    expect(await screen.findAllByText(t.linkCopied)).not.toHaveLength(0);
  });
});
