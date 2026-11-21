import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { FlaskConical, Sparkles, X } from 'lucide-react';
import { analyze, fetchCrops, fetchReport, isAbortError, MOCK_FORCED } from '../api/client';
import { DEMO_INPUT, FALLBACK_CROPS } from '../api/mock';
import type { AnalysisReport, Crop } from '../api/types';
import { ErrorBox } from '../components/ErrorBox';
import { LoadingSteps } from '../components/LoadingSteps';
import { ParamsPanel, validateForm, type FormState } from '../components/ParamsPanel';
import { ParcelMap } from '../components/ParcelMap';
import { ReportView } from '../components/report/ReportView';
import { Panel } from '../components/ui';
import { todayIso } from '../lib/format';

type Status = 'idle' | 'loading' | 'success' | 'error';
type LoadingKind = 'analyze' | 'report';

const DEMO_KEY = 'wodoplon-demo';

function readDemoFlag(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDemoFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(DEMO_KEY, '1');
    else sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* storage unavailable */
  }
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

const SEQUENCE = [
  { title: 'Ocena sytuacji wodnej', text: 'Opady, parowanie i susza na tle 10 lat.' },
  { title: 'Przyczyny i zatrzymanie wody', text: 'Co powoduje niedobór i jak zatrzymać deszcz.' },
  { title: 'Nawadnianie', text: 'Czy podlewać i kiedy — dopiero po retencji.' },
  { title: 'Źródła i ograniczenia', text: 'Skąd są dane. Raport do PDF i link.' },
];

function EmptyState({ onDemo }: { onDemo: () => void }) {
  return (
    <Panel className="p-5 sm:p-7">
      <h2 className="text-2xl font-bold">Tu pojawi się raport</h2>
      <p className="mt-1 max-w-prose text-muted">Raport zawsze ma te same cztery części, w tej kolejności:</p>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SEQUENCE.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display font-extrabold">
              {i + 1}
            </span>
            <div>
              <p className="font-bold leading-snug">{s.title}</p>
              <p className="text-sm text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onDemo}
        className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 font-semibold hover:bg-paper"
      >
        <Sparkles className="size-4 text-ochre" aria-hidden /> Załaduj przykład (demo)
      </button>
    </Panel>
  );
}

export function Workspace() {
  const { reportUuid } = useParams<{ reportUuid: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [crops, setCrops] = useState<Crop[]>(FALLBACK_CROPS);
  const [cropsFromFallback, setCropsFromFallback] = useState(false);
  const [form, setForm] = useState<FormState>({ dzialkaId: '', point: null, cropId: FALLBACK_CROPS[0].id, targetDate: todayIso() });
  const [mock, setMock] = useState<boolean>(() => MOCK_FORCED || readDemoFlag());
  const [status, setStatus] = useState<Status>(reportUuid ? 'loading' : 'idle');
  const [loadingKind, setLoadingKind] = useState<LoadingKind>('report');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<'analyze' | 'report'>('analyze');

  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<AnalysisReport | null>(null);
  reportRef.current = report;

  // Crops dictionary (falls back to the local list when the API is down)
  useEffect(() => {
    const ac = new AbortController();
    fetchCrops(ac.signal)
      .then(({ crops: list, fromFallback }) => {
        setCrops(list);
        setCropsFromFallback(fromFallback);
        setForm((f) => (list.some((c) => c.id === f.cropId) ? f : { ...f, cropId: list[0].id }));
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    document.title = report ? `Raport ${report.meta.dzialkaId} — WodoPlon` : 'WodoPlon — zatrzymaj wodę, chroń plony';
  }, [report]);

  const showReport = useCallback((r: AnalysisReport) => {
    setReport(r);
    setStatus('success');
    setForm((f) => ({ ...f, dzialkaId: r.meta.dzialkaId, point: null, cropId: r.meta.cropId, targetDate: r.meta.targetDate }));
  }, []);

  const loadReport = useCallback(
    (uuid: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLastAction('report');
      setLoadingKind('report');
      setStatus('loading');
      setError(null);
      fetchReport(uuid, { mock, signal: ac.signal })
        .then(showReport)
        .catch((e) => {
          if (isAbortError(e)) return;
          setError(e);
          setStatus('error');
        });
    },
    [mock, showReport],
  );

  // /report/:reportUuid — reuse the report passed via navigation state, otherwise fetch it
  useEffect(() => {
    if (!reportUuid) return;
    if (reportRef.current?.reportUuid === reportUuid) return;
    const fromState = (location.state as { report?: AnalysisReport } | null)?.report;
    if (fromState?.reportUuid === reportUuid) {
      showReport(fromState);
      return;
    }
    loadReport(reportUuid);
  }, [reportUuid]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runAnalysis = useCallback(
    async (f: FormState, useMock: boolean) => {
      const invalid = validateForm(f);
      setValidationError(invalid);
      if (invalid) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLastAction('analyze');
      setLoadingKind('analyze');
      setStatus('loading');
      setError(null);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));

      const id = f.dzialkaId.trim();
      try {
        const r = await analyze(
          {
            dzialkaId: f.point ? null : id || null,
            lat: f.point?.lat ?? null,
            lon: f.point?.lon ?? null,
            cropId: f.cropId,
            targetDate: f.targetDate,
          },
          { mock: useMock, signal: ac.signal },
        );
        setReport(r);
        setStatus('success');
        navigate(`/report/${r.reportUuid}`, { state: { report: r } });
      } catch (e) {
        if (isAbortError(e)) return;
        setError(e);
        setStatus('error');
      }
    },
    [navigate],
  );

  function cancel() {
    abortRef.current?.abort();
    setStatus(reportRef.current ? 'success' : 'idle');
  }

  function loadDemo() {
    const f: FormState = { dzialkaId: DEMO_INPUT.dzialkaId, point: null, cropId: DEMO_INPUT.cropId, targetDate: DEMO_INPUT.targetDate };
    setForm(f);
    setMock(true);
    writeDemoFlag(true);
    void runAnalysis(f, true);
  }

  function exitDemo() {
    setMock(false);
    writeDemoFlag(false);
  }

  function newAnalysis() {
    abortRef.current?.abort();
    setReport(null);
    setStatus('idle');
    setError(null);
    setForm((f) => ({ ...f, dzialkaId: '', point: null, targetDate: todayIso() }));
    navigate('/');
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  const busy = status === 'loading';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href="/" onClick={(e) => { e.preventDefault(); newAnalysis(); }} className="flex items-center gap-2.5" aria-label="WodoPlon — strona główna">
            <img src="/favicon.svg" alt="" className="size-9" />
            <span className="leading-tight">
              <span className="block font-display text-xl font-extrabold">WodoPlon</span>
              <span className="block text-xs text-muted">Zatrzymaj wodę, chroń plony</span>
            </span>
          </a>
          <button
            type="button"
            onClick={loadDemo}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-line px-3.5 py-2 text-sm font-semibold hover:bg-paper disabled:opacity-60"
          >
            <Sparkles className="size-4 text-ochre" aria-hidden /> Załaduj przykład (demo)
          </button>
        </div>
      </header>

      {mock && (
        <div className="no-print border-b border-ochre/30 bg-ochre-soft">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
            <p className="flex items-center gap-2">
              <FlaskConical className="size-4 shrink-0 text-ochre" aria-hidden />
              <span>
                <strong>Tryb demonstracyjny.</strong> Pokazujemy przykładowy raport, bez łączenia z serwerem analiz.
              </span>
            </p>
            {!MOCK_FORCED && (
              <button type="button" onClick={exitDemo} className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
                <X className="size-4" aria-hidden /> Wyłącz tryb demo
              </button>
            )}
          </div>
        </div>
      )}

      <main className="report-root mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <section className="no-print grid gap-4 lg:grid-cols-[minmax(320px,400px)_1fr]" aria-label="Parametry analizy">
          <Panel className="p-5 sm:p-6">
            <h1 className="text-3xl font-extrabold sm:text-[2.1rem]">Czy Twojemu polu brakuje wody?</h1>
            <p className="mt-2 mb-6 text-muted">
              Wskaż działkę, wybierz uprawę i dzień. Dostaniesz ocenę suszy, sposoby na zatrzymanie wody, a na końcu zalecenia
              dotyczące nawadniania.
            </p>
            <ParamsPanel
              form={form}
              crops={crops}
              cropsFromFallback={cropsFromFallback}
              busy={busy}
              validationError={validationError}
              onChange={(patch) => {
                setValidationError(null);
                setForm((f) => ({ ...f, ...patch }));
              }}
              onSubmit={() => void runAnalysis(form, mock)}
            />
          </Panel>
          <div className="h-[380px] sm:h-[480px] lg:h-auto lg:min-h-[600px]">
            <ParcelMap
              point={form.point}
              geometry={status === 'success' ? report?.geometry ?? null : null}
              geometryKey={report?.reportUuid ?? null}
              disabled={busy}
              onPick={(lat, lon) => {
                setValidationError(null);
                setForm((f) => ({ ...f, point: { lat, lon }, dzialkaId: '' }));
              }}
            />
          </div>
        </section>

        <div ref={resultRef} className="mt-8 scroll-mt-4 print:mt-0">
          {status === 'loading' && <LoadingSteps key={loadingKind} fast={mock || loadingKind === 'report'} onCancel={cancel} />}
          {status === 'error' && (
            <ErrorBox
              error={error}
              context={lastAction}
              onRetry={() => (lastAction === 'report' && reportUuid ? loadReport(reportUuid) : void runAnalysis(form, mock))}
              onDemo={loadDemo}
            />
          )}
          {status === 'success' && report && <ReportView report={report} onNewAnalysis={newAnalysis} />}
          {status === 'idle' && <EmptyState onDemo={loadDemo} />}
        </div>
      </main>

      <footer className="no-print border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-5 text-sm text-muted sm:px-6">
          <p>
            WodoPlon — projekt HackNation 2026 dla KOWR. Dane: GUGiK (ULDK, NMT), Open-Meteo, ISRIC SoilGrids, Copernicus Sentinel-2.
            Nie zbieramy danych osobowych i nie wymagamy logowania.
          </p>
        </div>
      </footer>
    </div>
  );
}
