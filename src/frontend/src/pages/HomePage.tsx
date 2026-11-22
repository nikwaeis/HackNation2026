import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, analyzeParcel, fetchCrops } from '../api/client';
import { FALLBACK_CROPS, SAMPLE_DEMO_REPORT } from '../api/mockData';
import {
  PARCEL_ID_PATTERN,
  UldkError,
  fetchParcelById,
  fetchParcelByPoint,
  type UldkParcel,
} from '../api/uldk';
import type { CropResponse } from '../types/api';
import type { Language, TranslationDict } from '../i18n/translations';
import { ParcelForm, needsTerritoryConfirmation, type ParcelLookup } from '../components/ParcelForm';
import { assessTerritory } from '../api/territory';
import type { FieldArea } from '../api/mapContext';
import { labelPoint } from '../lib/geo';
import { loadMapView, saveMapView } from '../lib/mapView';
import { ParcelMap } from '../components/ParcelMap';
import { LoadingState } from '../components/LoadingState';
import { ErrorBanner } from '../components/ErrorBanner';

interface HomePageProps {
  t: TranslationDict;
  lang: Language;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const IDLE_LOOKUP: ParcelLookup = { status: 'idle', source: null, parcel: null };

/**
 * Open straight on farmland instead of the whole country, so the clickable fields are visible right away.
 * Arable land south-east of Lubowidz (powiat żuromiński, mazowieckie): this county publishes EGiB land-use
 * classes (checked 2026-11-21: RIVa / RIVb / RV around the centre), so the land-type check has data here.
 * Zoom 17 is the smallest zoom at which GUGiK draws parcel boundaries. "Show all of Poland" is on the map.
 */
const START_VIEW: { center: [number, number]; zoom: number } = { center: [53.116, 19.8665], zoom: 17 };

export function HomePage({ t, lang }: HomePageProps) {
  const navigate = useNavigate();
  // back from a report ("Nowe sprawdzenie") the map stays where the user left it
  const [initialView] = useState(() => loadMapView() ?? START_VIEW);

  const today = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => isoDate(today), [today]);
  const minDate = useMemo(() => {
    const past = new Date(today);
    past.setFullYear(past.getFullYear() - 10);
    return isoDate(past);
  }, [today]);

  const [crops, setCrops] = useState<CropResponse[]>(FALLBACK_CROPS);
  const [dzialkaId, setDzialkaId] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [cropId, setCropId] = useState(FALLBACK_CROPS[0].id);
  const [targetDate, setTargetDate] = useState(maxDate);

  // Parcel outline from ULDK (visual only — the analysis request is unchanged)
  const [lookup, setLookup] = useState<ParcelLookup>(IDLE_LOOKUP);
  const lookupAbort = useRef<AbortController | null>(null);
  /** Farm fields (OSM) loaded for the visible map area — extra evidence for the land-type check */
  const viewFields = useRef<FieldArea[] | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{ message: string; canDemo: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCrops(lang)
      .then((list) => {
        if (!active || list.length === 0) return;
        setCrops(list);
        setCropId((current) => (list.some((c) => c.id === current) ? current : list[0].id));
      })
      .catch(() => {
        // Fallback seeded crops stay active when backend is offline
      });
    return () => {
      active = false;
    };
  }, [lang]);

  useEffect(() => () => lookupAbort.current?.abort(), []);

  function startLookup(
    source: 'point' | 'id',
    fetcher: (signal: AbortSignal) => Promise<UldkParcel>,
    clickPoint?: { lat: number; lon: number },
  ) {
    lookupAbort.current?.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;
    setLookup({ status: 'loading', source, parcel: null });
    fetcher(controller.signal)
      .then((parcel) => {
        if (controller.signal.aborted) return;
        // show the ULDK boundary right away, then check what kind of land it is
        setLookup({ status: 'found', source, parcel, territory: { status: 'checking' } });
        const [lat, lon] = clickPoint ? [clickPoint.lat, clickPoint.lon] : labelPoint(parcel.geometry);
        assessTerritory({ lat, lon }, viewFields.current, controller.signal, parcel.id)
          .then((verdict) => {
            if (!controller.signal.aborted) {
              setLookup({ status: 'found', source, parcel, territory: { status: 'done', verdict } });
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setLookup({ status: 'found', source, parcel, territory: { status: 'done', verdict: { kind: 'unverified' } } });
            }
          });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const status = err instanceof UldkError && err.kind === 'NOT_FOUND' ? 'notFound' : 'unavailable';
        setLookup({ status, source, parcel: null });
      });
  }

  function resetLookup() {
    lookupAbort.current?.abort();
    setLookup(IDLE_LOOKUP);
  }

  // Typed parcel ID → outline it on the map once the ID looks complete
  useEffect(() => {
    const id = dzialkaId.trim();
    if (selectedPoint || !PARCEL_ID_PATTERN.test(id)) return;
    if (lookup.source === 'id' && lookup.parcel?.id === id) return;
    const timer = window.setTimeout(() => startLookup('id', (signal) => fetchParcelById(id, signal)), 700);
    return () => window.clearTimeout(timer);
    // startLookup / lookup are intentionally not dependencies: only a new ID should trigger a lookup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dzialkaId, selectedPoint]);

  function handleDzialkaChange(val: string) {
    setDzialkaId(val);
    if (val.trim().length > 0 && selectedPoint) {
      setSelectedPoint(null);
    }
    if (lookup.status !== 'idle') resetLookup();
    setValidationError(null);
    setApiError(null);
  }

  function handleSelectMapPoint(lat: number, lon: number) {
    setSelectedPoint({ lat, lon });
    setDzialkaId('');
    setValidationError(null);
    setApiError(null);
    startLookup('point', (signal) => fetchParcelByPoint(lat, lon, signal), { lat, lon });
  }

  function handleConfirmTerritory() {
    setLookup((current) => ({ ...current, confirmed: true }));
    setValidationError(null);
  }

  function handleClearPoint() {
    setSelectedPoint(null);
    resetLookup();
  }

  function openDemoReport() {
    navigate('/report/demo-preview', { state: { report: SAMPLE_DEMO_REPORT, isDemo: true } });
  }

  async function runAnalysis() {
    const trimmedId = dzialkaId.trim();
    if (!trimmedId && !selectedPoint) {
      setValidationError(t.errorNoLocation);
      return;
    }
    if (needsTerritoryConfirmation(lookup)) {
      setValidationError(t.errorTerritoryUnconfirmed);
      return;
    }
    if (!cropId) {
      setValidationError(t.errorNoCrop);
      return;
    }
    if (!targetDate || targetDate < minDate || targetDate > maxDate) {
      setValidationError(t.errorDateRange);
      return;
    }

    setValidationError(null);
    setApiError(null);
    setLoading(true);

    try {
      const report = await analyzeParcel(
        {
          dzialkaId: trimmedId ? trimmedId : null,
          lat: selectedPoint ? selectedPoint.lat : null,
          lon: selectedPoint ? selectedPoint.lon : null,
          cropId,
          targetDate,
        },
        lang,
      );
      navigate(`/report/${report.reportUuid}`, { state: { report, isDemo: false } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isTimeout) {
          setApiError({ message: t.errorTimeout, canDemo: true });
        } else if (err.isNetwork) {
          setApiError({ message: t.errorNetwork, canDemo: true });
        } else {
          // e.g. "Usługa ULDK GUGiK jest chwilowo niedostępna" — let the user still see a sample report
          setApiError({ message: err.message, canDemo: err.status >= 500 });
        }
      } else {
        setApiError({ message: t.errorNetwork, canDemo: true });
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runAnalysis();
  }

  const parcelLabel = lookup.parcel
    ? {
        title: lookup.parcel.id,
        subtitle: `~${new Intl.NumberFormat(lang === 'pl' ? 'pl-PL' : 'en-GB', { maximumFractionDigits: 2 }).format(
          lookup.parcel.areaHa,
        )} ha${lookup.parcel.voivodeship ? ` · ${lookup.parcel.voivodeship}` : ''}`,
      }
    : null;

  return (
    <main
      id="main-content"
      className="relative flex w-full flex-col lg:h-[calc(100vh-65px)] lg:overflow-hidden"
    >
      {/* Full-bleed interactive Poland map on desktop; top canvas on mobile */}
      <section
        aria-label={t.layerMap}
        className="h-[56svh] max-h-[560px] min-h-[340px] w-full sm:h-[440px] sm:max-h-none lg:absolute lg:inset-0 lg:h-full"
      >
        <ParcelMap
          t={t}
          interactive
          selectedPoint={selectedPoint}
          onSelectPoint={handleSelectMapPoint}
          selectionOutline={lookup.parcel?.geometry ?? null}
          selectionLoading={lookup.status === 'loading'}
          parcelLabel={parcelLabel}
          initialView={initialView}
          onViewChange={saveMapView}
          onViewFieldsChange={(fields) => {
            viewFields.current = fields;
          }}
          selectionTone={needsTerritoryConfirmation(lookup) ? 'warn' : 'ok'}
          defaultBaseLayer="orto"
          defaultShowParcels
          showViewportWater
          overlayOffsetClass="lg:left-[480px]"
          className="h-full"
        />
      </section>

      {/* Analysis progress floats over the map on desktop */}
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[450] hidden items-center justify-center pl-[460px] pr-8 lg:flex">
          <div className="pointer-events-auto w-full max-w-md">
            <LoadingState t={t} variant="floating" />
          </div>
        </div>
      )}

      {/* Floating search sheet */}
      <aside
        aria-label={t.formTitle}
        className="relative z-10 w-full px-4 py-5 sm:px-6 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:left-0 lg:w-auto lg:p-5"
      >
        <div className="glass-sheet panel-scroll w-full p-5 sm:p-6 lg:pointer-events-auto lg:max-h-full lg:w-[440px] lg:overflow-y-auto">
          {apiError && (
            <div className="mb-5">
              <ErrorBanner
                t={t}
                message={apiError.message}
                onRetry={() => void runAnalysis()}
                onOpenDemo={apiError.canDemo ? openDemoReport : undefined}
              />
            </div>
          )}

          <ParcelForm
            t={t}
            lang={lang}
            crops={crops}
            dzialkaId={dzialkaId}
            onChangeDzialkaId={handleDzialkaChange}
            selectedPoint={selectedPoint}
            onClearPoint={handleClearPoint}
            lookup={lookup}
            cropId={cropId}
            onChangeCropId={setCropId}
            targetDate={targetDate}
            onChangeTargetDate={setTargetDate}
            minDate={minDate}
            maxDate={maxDate}
            submitting={loading}
            validationError={validationError}
            onSubmit={handleSubmit}
            onOpenDemo={openDemoReport}
            onConfirmTerritory={handleConfirmTerritory}
          />

          {loading && (
            <div className="mt-5 lg:hidden">
              <LoadingState t={t} variant="inline" />
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}
