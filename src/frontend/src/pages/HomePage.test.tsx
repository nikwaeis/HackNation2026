import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { translations } from '../i18n/translations';
import { FALLBACK_CROPS, SAMPLE_DEMO_REPORT } from '../api/mockData';
import { FIELD, HOUSE_PLOT, ULDK_NOT_FOUND, kiegXml, routedFetch, uldkBody } from '../test/fixtures';

/*
 * Whole parcel-selection flow of the home page with every external service mocked:
 * map click -> ULDK GetParcelByXY -> EGiB land-type check (KIEG) -> warning / confirmation -> POST /api/analyze.
 * Leaflet cannot render in jsdom, so ParcelMap is replaced by a stub that exposes the same props.
 */
vi.mock('../components/ParcelMap', () => ({
  ParcelMap: (props: {
    onSelectPoint?: (lat: number, lon: number) => void;
    selectionOutline?: unknown;
    selectionTone?: string;
    parcelLabel?: { title: string; subtitle?: string } | null;
  }) => (
    <div
      data-testid="map"
      data-tone={props.selectionTone}
      data-outline={props.selectionOutline ? 'yes' : 'no'}
      data-label={props.parcelLabel?.title ?? ''}
    >
      <button type="button" onClick={() => props.onSelectPoint?.(53.11922, 19.84957)}>
        stub-click-house
      </button>
      <button type="button" onClick={() => props.onSelectPoint?.(52.718, 18.345)}>
        stub-click-field
      </button>
      <button type="button" onClick={() => props.onSelectPoint?.(54.9, 14.2)}>
        stub-click-sea
      </button>
    </div>
  ),
}));

const t = translations.pl;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let analyzeBodies: unknown[];

function installFetch() {
  analyzeBodies = [];
  const { fn, calls } = routedFetch([
    [(u) => u.endsWith('/api/crops'), () => Response.json(FALLBACK_CROPS)],
    [
      (u) => u.endsWith('/api/analyze'),
      (_u, init) => {
        analyzeBodies.push(JSON.parse(String(init?.body)));
        return Response.json({ ...SAMPLE_DEMO_REPORT, reportUuid: '11111111-2222-3333-4444-555555555555' });
      },
    ],
    [
      (u) => u.includes('GetParcelByXY'),
      (u) => {
        const xy = new URL(u, 'http://x').searchParams.get('xy');
        if (xy === '19.84957,53.11922,4326') return new Response(uldkBody(HOUSE_PLOT.id, HOUSE_PLOT.voivodeship, HOUSE_PLOT.wkt));
        if (xy === '18.345,52.718,4326') return new Response(uldkBody(FIELD.id, FIELD.voivodeship, FIELD.wkt));
        return new Response(ULDK_NOT_FOUND);
      },
    ],
    [(u) => u.includes('GetParcelById'), () => new Response(uldkBody(FIELD.id, FIELD.voivodeship, FIELD.wkt))],
    [
      (u) => u.includes('KrajowaIntegracjaEwidencjiGruntow'),
      (u) => {
        const [s, , n] = new URL(u).searchParams.get('BBOX')!.split(',').map(Number);
        const lat = (s + n) / 2;
        return new Response(kiegXml({ kontur: Math.abs(lat - 53.11922) < 1e-4 ? 'B' : 'RIVa' }));
      },
    ],
  ]);
  vi.stubGlobal('fetch', fn);
  return calls;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage t={t} lang="pl" />} />
        <Route path="/report/:reportUuid" element={<div>REPORT PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  installFetch();
});

afterEach(() => vi.unstubAllGlobals());

describe('HomePage — parcel selection by map click', () => {
  it('house plot (EGiB "B"): outlines it, warns, blocks the analysis until the farmer confirms', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByText('stub-click-house'));

    // ULDK result is shown right away in the "Zaznaczona działka" card and on the map
    expect(await screen.findByText(HOUSE_PLOT.id)).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-label', HOUSE_PLOT.id);
    expect(screen.getByTestId('map')).toHaveAttribute('data-outline', 'yes');

    // EGiB check -> clear Polish warning with the reason and the register code
    expect(await screen.findByText(t.territoryWarnTitle)).toBeInTheDocument();
    expect(screen.getByText(/teren zabudowany \(mieszkaniowy/)).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-tone', 'warn');

    // analysis is not started for an unconfirmed built-up parcel
    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText(t.errorTerritoryUnconfirmed)).toBeInTheDocument();
    expect(analyzeBodies).toHaveLength(0);

    // explicit confirmation (e.g. a large field with a farm building)
    await user.click(screen.getByRole('button', { name: t.territoryConfirm }));
    expect(screen.getByText(t.territoryConfirmed)).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-tone', 'ok');

    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText('REPORT PAGE')).toBeInTheDocument();

    // POST /api/analyze contract unchanged: map click -> dzialkaId null + exact WGS84 lat/lon
    expect(analyzeBodies).toEqual([
      { dzialkaId: null, lat: 53.11922, lon: 19.84957, cropId: 'winter_wheat', targetDate: todayIso() },
    ]);
  });

  it('"Wybierz inną działkę" drops the built-up parcel and returns to the ID input', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByText('stub-click-house'));
    await user.click(await screen.findByRole('button', { name: t.territoryPickOther }));
    expect(screen.queryByText(HOUSE_PLOT.id)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(t.parcelInputPlaceholder)).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-outline', 'no');
  });

  it('arable field (EGiB "RIVa"): no warning, register tag shown, analysis runs directly', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByText('stub-click-field'));

    expect(await screen.findByText(/Grunty orne/)).toBeInTheDocument();
    expect(screen.queryByText(t.territoryWarnTitle)).not.toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-tone', 'ok');

    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText('REPORT PAGE')).toBeInTheDocument();
    expect(analyzeBodies[0]).toMatchObject({ dzialkaId: null, lat: 52.718, lon: 18.345 });
  });

  it('click with no cadastral parcel (sea / outside Poland) shows the Polish not-found message', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByText('stub-click-sea'));
    expect(await screen.findByText(t.parcelLookupNotFound)).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-outline', 'no');
  });

  it('a new click replaces the previous parcel (id, outline and land check update)', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByText('stub-click-house'));
    await screen.findByText(t.territoryWarnTitle);
    await user.click(screen.getByText('stub-click-field'));
    expect(await screen.findByText(FIELD.id)).toBeInTheDocument();
    expect(screen.queryByText(HOUSE_PLOT.id)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(t.territoryWarnTitle)).not.toBeInTheDocument());
  });
});

describe('HomePage — parcel selection by ID (how the jury enters parcels)', () => {
  it('typed TERYT id: outlines the parcel via GetParcelById and sends dzialkaId to the API', async () => {
    const calls = installFetch();
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByPlaceholderText(t.parcelInputPlaceholder), FIELD.id);
    await waitFor(() => expect(calls.some((c) => c.url.includes('GetParcelById'))).toBe(true), { timeout: 2000 });
    expect(await screen.findByText(/Grunty orne/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText('REPORT PAGE')).toBeInTheDocument();
    expect(analyzeBodies[0]).toEqual({
      dzialkaId: FIELD.id,
      lat: null,
      lon: null,
      cropId: 'winter_wheat',
      targetDate: todayIso(),
    });
  });

  it('nothing selected -> validation message, no request', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText(t.errorNoLocation)).toBeInTheDocument();
    expect(analyzeBodies).toHaveLength(0);
  });

  it('date older than 10 years is rejected before calling the API', async () => {
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByPlaceholderText(t.parcelInputPlaceholder), FIELD.id);
    const date = screen.getByLabelText(t.step3Label, { selector: 'input' });
    await user.clear(date);
    await user.type(date, '2010-06-01');
    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText(t.errorDateRange)).toBeInTheDocument();
    expect(analyzeBodies).toHaveLength(0);
  });

  it('backend down -> clear error with a way to open the sample report', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch([
        [(u) => u.endsWith('/api/analyze'), () => Promise.reject(new TypeError('Failed to fetch'))],
        [(u) => u.includes('GetParcelById'), () => new Response(uldkBody(FIELD.id, FIELD.voivodeship, FIELD.wkt))],
        [(u) => u.includes('KrajowaIntegracjaEwidencjiGruntow'), () => new Response(kiegXml({ kontur: 'RV' }))],
        [() => true, () => Response.json(FALLBACK_CROPS)],
      ]).fn,
    );
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByPlaceholderText(t.parcelInputPlaceholder), FIELD.id);
    await user.click(screen.getByRole('button', { name: t.submitButton }));
    expect(await screen.findByText(t.errorNetwork)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: t.openDemoReport }).length).toBeGreaterThan(0);
  });
});
