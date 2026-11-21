import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, analyzeParcel, fetchCrops } from '../api/client';
import { FALLBACK_CROPS, SAMPLE_DEMO_REPORT } from '../api/mockData';
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
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [cropId, setCropId] = useState(FALLBACK_CROPS[0].id);
  const [targetDate, setTargetDate] = useState(maxDate);

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

  function handleDzialkaChange(val: string) {
    setDzialkaId(val);
    if (val.trim().length > 0 && selectedPoint) {
      setSelectedPoint(null);
    }
    setValidationError(null);
    setApiError(null);
  }

  function handleSelectMapPoint(lat: number, lon: number) {
    setSelectedPoint({ lat, lon });
    setDzialkaId('');
    setValidationError(null);
    setApiError(null);
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
      {/* Full-bleed interactive Poland map on desktop; top canvas on mobile */}
      <section
        aria-label={t.layerMap}
        className="h-[340px] w-full sm:h-[400px] lg:absolute lg:inset-0 lg:h-full"
      >
        <ParcelMap
          t={t}
          interactive
          selectedPoint={selectedPoint}
          onSelectPoint={handleSelectMapPoint}
          className="h-full"
        />
      </section>

      {/* Floating elevated search sheet (Setproduct map-first composition) */}
      <aside
        aria-label={t.formTitle}
        className="relative z-10 w-full px-4 py-5 sm:px-6 lg:pointer-events-none lg:flex lg:h-full lg:max-w-[1440px] lg:items-start lg:p-5"
      >
        <div
          className="w-full rounded-2xl p-6 lg:pointer-events-auto lg:max-h-full lg:w-[412px] lg:overflow-y-auto"
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
            selectedPoint={selectedPoint}
            onClearPoint={() => setSelectedPoint(null)}
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
