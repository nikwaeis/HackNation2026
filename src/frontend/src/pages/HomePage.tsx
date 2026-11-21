import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, analyzeParcel, fetchCrops } from '../api/client';
import { FALLBACK_CROPS, SAMPLE_DEMO_REPORT, SAMPLE_PARCEL_ID } from '../api/mockData';
import {
  lookupParcelById,
  lookupParcelByPoint,
  type UldkResolvedParcel,
} from '../api/uldk';
import type { CropResponse } from '../types/api';
import type { Language, TranslationDict } from '../i18n/translations';
import { ParcelForm } from '../components/ParcelForm';
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

export function HomePage({ t, lang }: HomePageProps) {
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const maxDate = useMemo(() => isoDate(today), [today]);
  const minDate = useMemo(() => {
    const past = new Date(today);
    past.setFullYear(past.getFullYear() - 10);
    return isoDate(past);
  }, [today]);

  const [crops, setCrops] = useState<CropResponse[]>(FALLBACK_CROPS);
  const [dzialkaId, setDzialkaId] = useState('');
  const [selectedParcel, setSelectedParcel] = useState<UldkResolvedParcel | null>(null);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [resolvingParcel, setResolvingParcel] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [cropId, setCropId] = useState(FALLBACK_CROPS[0].id);
  const [targetDate, setTargetDate] = useState(maxDate);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<{ message: string; canDemo: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const lookupAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    return () => {
      lookupAbortRef.current?.abort();
    };
  }, []);

  function handleDzialkaChange(val: string) {
    setDzialkaId(val);
    if (selectedParcel && val.trim() !== selectedParcel.dzialkaId) {
      setSelectedParcel(null);
      setClickedCoords(null);
    }
    setMapError(null);
    setValidationError(null);
    setApiError(null);
  }

  function handleClearSelectedParcel() {
    lookupAbortRef.current?.abort();
    setSelectedParcel(null);
    setClickedCoords(null);
    setDzialkaId('');
    setMapError(null);
    setResolvingParcel(false);
  }

  async function handleInsertSample() {
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setDzialkaId(SAMPLE_PARCEL_ID);
    setValidationError(null);
    setApiError(null);
    setMapError(null);
    setResolvingParcel(true);

    try {
      const resolved = await lookupParcelById(SAMPLE_PARCEL_ID, controller.signal);
      if (resolved) {
        setSelectedParcel(resolved);
        setDzialkaId(resolved.dzialkaId);
      }
    } catch {
      // Keep the sample ID in the field even if ULDK is temporarily unreachable
    } finally {
      if (!controller.signal.aborted) {
        setResolvingParcel(false);
      }
    }
  }

  async function handleSelectMapPoint(lat: number, lon: number) {
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    setClickedCoords({ lat, lon });
    setMapError(null);
    setValidationError(null);
    setApiError(null);
    setResolvingParcel(true);

    try {
      const resolved = await lookupParcelByPoint(lat, lon, controller.signal);
      if (!resolved) {
        setSelectedParcel(null);
        setClickedCoords(null);
        setMapError(t.mapParcelNotFound);
        return;
      }
      setSelectedParcel(resolved);
      setDzialkaId(resolved.dzialkaId);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMapError(t.mapParcelNotFound);
    } finally {
      if (!controller.signal.aborted) {
        setResolvingParcel(false);
      }
    }
  }

  function openDemoReport() {
    navigate('/report/demo-preview', { state: { report: SAMPLE_DEMO_REPORT, isDemo: true } });
  }

  async function runAnalysis() {
    const trimmedId = dzialkaId.trim();
    if (!trimmedId && !clickedCoords) {
      setValidationError(t.errorNoLocation);
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
          lat: trimmedId ? null : (clickedCoords?.lat ?? null),
          lon: trimmedId ? null : (clickedCoords?.lon ?? null),
          cropId,
          targetDate,
        },
        lang,
      );
      navigate(`/report/${report.reportUuid}`, { state: { report, isDemo: false } });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.isTimeout) {
          setApiError({ message: t.errorTimeout, canDemo: false });
        } else if (err.isNetwork) {
          setApiError({ message: t.errorNetwork, canDemo: true });
        } else {
          setApiError({ message: err.message, canDemo: false });
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

  if (loading) {
    return (
      <main id="main-content" className="px-4 py-12 sm:py-20">
        <LoadingState t={t} />
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="relative flex w-full flex-col lg:h-[calc(100vh-65px)] lg:overflow-hidden"
    >
      {/* Full-bleed interactive Poland map */}
      <section
        aria-label={t.layerMap}
        className="h-[340px] w-full sm:h-[400px] lg:absolute lg:inset-0 lg:h-full"
      >
        <ParcelMap
          t={t}
          interactive
          onSelectPoint={(lat, lon) => void handleSelectMapPoint(lat, lon)}
          resolvingParcel={resolvingParcel}
          mapError={mapError}
          polygon={selectedParcel?.geometry ?? null}
          className="h-full"
        />
      </section>

      {/* Floating elevated search sheet */}
      <aside
        aria-label={t.formTitle}
        className="relative z-10 w-full px-4 py-5 sm:px-6 lg:pointer-events-none lg:flex lg:h-full lg:max-w-[1440px] lg:items-start lg:p-5"
      >
        <div
          className="w-full rounded-2xl p-6 lg:pointer-events-auto lg:max-h-full lg:w-[436px] lg:overflow-y-auto"
          style={{
            backgroundColor: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-float)',
          }}
        >
          {apiError && (
            <div className="mb-4">
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
            onInsertSample={() => void handleInsertSample()}
            selectedParcel={selectedParcel}
            onClearSelectedParcel={handleClearSelectedParcel}
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
          />
        </div>
      </aside>
    </main>
  );
}
