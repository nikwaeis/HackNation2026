import type {
  AnalysisResponse,
  AnalyzeParcelRequest,
  CropResponse,
  ProblemDetails,
} from '../types/api';
import type { Language } from '../i18n/translations';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/** Absolute or proxied URL of a backend path such as `/api/map/context` */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export class ApiError extends Error {
  status: number;
  isNetwork: boolean;
  isTimeout: boolean;

  constructor(message: string, status = 0, isNetwork = false, isTimeout = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetwork = isNetwork;
    this.isTimeout = isTimeout;
  }
}

async function parseProblemMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ProblemDetails;
    if (body.errors) {
      const firstList = Object.values(body.errors)[0];
      if (firstList && firstList.length > 0) {
        return firstList[0];
      }
    }
    if (body.detail) return body.detail;
    if (body.title) return body.title;
  } catch {
    // Response wasn't JSON
  }
  return `HTTP ${response.status}`;
}

async function requestJson<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number; lang?: Language } = {},
): Promise<T> {
  const { timeoutMs = 35_000, lang = 'pl', headers, ...rest } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Language': lang,
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    });

    if (!res.ok) {
      const message = await parseProblemMessage(res);
      throw new ApiError(message, res.status, false, false);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out', 408, false, true);
    }
    throw new ApiError('Network unreachable', 0, true, false);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchCrops(lang: Language): Promise<CropResponse[]> {
  return requestJson<CropResponse[]>('/api/crops', {
    method: 'GET',
    timeoutMs: 6_000,
    lang,
  });
}

export async function analyzeParcel(
  payload: AnalyzeParcelRequest,
  lang: Language,
): Promise<AnalysisResponse> {
  return requestJson<AnalysisResponse>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 35_000,
    lang,
  });
}

export async function fetchReport(
  reportUuid: string,
  lang: Language,
): Promise<AnalysisResponse> {
  return requestJson<AnalysisResponse>(`/api/reports/${encodeURIComponent(reportUuid)}`, {
    method: 'GET',
    timeoutMs: 12_000,
    lang,
  });
}
