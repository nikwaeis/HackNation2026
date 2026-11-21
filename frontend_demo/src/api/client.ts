import { DEMO_REPORT_RAW, DEMO_REPORT_UUID, FALLBACK_CROPS } from './mock';
import { normalizeReport } from './normalize';
import type { AnalysisReport, AnalyzeRequest, Crop } from './types';

const demoReport = (): AnalysisReport => normalizeReport(structuredClone(DEMO_REPORT_RAW));

const RAW_BASE = import.meta.env.VITE_API_BASE_URL?.trim() || '/api';
/** Base URL including the `/api` prefix, without a trailing slash. */
export const API_BASE_URL = RAW_BASE.replace(/\/+$/, '');
export const MOCK_FORCED = import.meta.env.VITE_USE_MOCK === 'true';

/** Backend budget is ~30 s; give the network a little slack on top of it. */
const ANALYZE_TIMEOUT_MS = 40_000;

export type ApiErrorKind =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'BAD_GATEWAY'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'SERVER'
  | 'NETWORK';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly detail: string | null;

  constructor(kind: ApiErrorKind, status: number | null, detail: string | null) {
    super(detail ?? kind);
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'BAD_REQUEST';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 502 || status === 503) return 'BAD_GATEWAY';
  if (status === 504) return 'TIMEOUT';
  return 'SERVER';
}

/**
 * Reads the message from an ASP.NET ProblemDetails body (already localized to Polish by the API):
 * `detail` for domain errors, or `errors: { field: [messages] }` for validation problems.
 */
async function readDetail(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object') return null;
    const { detail, errors } = body as { detail?: unknown; errors?: unknown };
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (errors && typeof errors === 'object') {
      const messages = Object.values(errors as Record<string, unknown>)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .filter((m): m is string => typeof m === 'string' && m.trim() !== '');
      if (messages.length) return [...new Set(messages)].join(' ');
    }
  } catch {
    /* non-JSON body */
  }
  return null;
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: { Accept: 'application/json', 'Accept-Language': 'pl', ...(rest.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) throw new ApiError('TIMEOUT', null, null);
    if (signal?.aborted) throw err; // cancelled by the caller — propagate AbortError
    throw new ApiError('NETWORK', null, null);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!res.ok) {
    const detail = await readDetail(res);
    let kind = kindFromStatus(res.status);
    // The API reports outages of ULDK / Open-Meteo / etc. as 500 with a Polish "…niedostępna" message
    if (kind === 'SERVER' && detail && /niedostępn|unavailable/i.test(detail)) kind = 'BAD_GATEWAY';
    throw new ApiError(kind, res.status, detail);
  }
  try {
    return (await res.json()) as T;
  } catch {
    // e.g. an HTML page returned by a misconfigured proxy
    throw new ApiError('SERVER', res.status, null);
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function fetchCrops(signal?: AbortSignal): Promise<{ crops: Crop[]; fromFallback: boolean }> {
  if (MOCK_FORCED) return { crops: FALLBACK_CROPS, fromFallback: false };
  try {
    const crops = await request<Crop[]>('/crops', { signal, timeoutMs: 8_000 });
    if (!Array.isArray(crops) || crops.length === 0) return { crops: FALLBACK_CROPS, fromFallback: true };
    return { crops, fromFallback: false };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { crops: FALLBACK_CROPS, fromFallback: true };
  }
}

export async function analyze(
  body: AnalyzeRequest,
  opts: { mock: boolean; signal?: AbortSignal },
): Promise<AnalysisReport> {
  if (opts.mock || MOCK_FORCED) {
    // Demo mode: briefly simulate the real 5–20 s pipeline so the progress view is visible.
    await delay(4_500, opts.signal);
    return demoReport();
  }
  const raw = await request<unknown>('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
    timeoutMs: ANALYZE_TIMEOUT_MS,
  });
  return toReport(raw);
}

function toReport(raw: unknown): AnalysisReport {
  try {
    const report = normalizeReport(raw);
    if (!report.reportUuid) throw new Error('missing reportUuid');
    return report;
  } catch {
    throw new ApiError('SERVER', 200, 'Serwer zwrócił raport w nieoczekiwanym formacie.');
  }
}

export async function fetchReport(
  reportUuid: string,
  opts: { mock: boolean; signal?: AbortSignal },
): Promise<AnalysisReport> {
  const isDemo = reportUuid === DEMO_REPORT_UUID;
  if ((opts.mock || MOCK_FORCED) && isDemo) return demoReport();
  try {
    const raw = await request<unknown>(`/reports/${encodeURIComponent(reportUuid)}`, {
      signal: opts.signal,
      timeoutMs: 15_000,
    });
    return toReport(raw);
  } catch (err) {
    // The demo report link must open even when no backend is running.
    if (isDemo && err instanceof ApiError) return demoReport();
    throw err;
  }
}
