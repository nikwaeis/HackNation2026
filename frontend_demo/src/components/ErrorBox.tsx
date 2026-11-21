import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import { ApiError, type ApiErrorKind } from '../api/client';
import { Panel } from './ui';

const MESSAGES: Record<ApiErrorKind, { title: string; text: string }> = {
  BAD_REQUEST: {
    title: 'Sprawdź wpisane dane',
    text: 'Numer działki ma nieprawidłowy format albo wybrana data jest niepoprawna. Popraw dane i spróbuj ponownie.',
  },
  NOT_FOUND: {
    title: 'Nie znaleziono działki',
    text: 'Tej działki nie ma w ewidencji gruntów (ULDK GUGiK) albo wskazany punkt leży poza Polską lub na wodzie. Sprawdź numer albo kliknij na mapie środek pola.',
  },
  BAD_GATEWAY: {
    title: 'Źródło danych jest chwilowo niedostępne',
    text: 'Jeden z serwisów zewnętrznych (np. ewidencja gruntów lub dane pogodowe) nie odpowiada. Spróbuj ponownie za kilka minut.',
  },
  TIMEOUT: {
    title: 'Analiza trwała zbyt długo',
    text: 'Serwisy z danymi odpowiadały zbyt wolno. Spróbuj ponownie — kolejna próba jest zwykle szybsza, bo część danych jest już zapisana.',
  },
  RATE_LIMIT: {
    title: 'Zbyt wiele zapytań',
    text: 'Wykonano zbyt wiele analiz w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.',
  },
  SERVER: {
    title: 'Błąd serwera',
    text: 'Coś poszło nie tak po stronie serwera. Spróbuj ponownie za chwilę.',
  },
  NETWORK: {
    title: 'Brak połączenia z serwerem',
    text: 'Nie udało się połączyć z serwerem WodoPlon. Sprawdź internet albo uruchom przykład, aby zobaczyć, jak wygląda raport.',
  },
};

const REPORT_NOT_FOUND = {
  title: 'Nie znaleziono raportu',
  text: 'Link do raportu jest nieprawidłowy albo raport już nie istnieje. Wykonaj nową analizę dla swojej działki.',
};

export function describeError(
  err: unknown,
  context: 'analyze' | 'report' = 'analyze',
): { title: string; text: string; detail: string | null; status: number | null } {
  if (err instanceof ApiError) {
    const base = context === 'report' && err.kind === 'NOT_FOUND' ? REPORT_NOT_FOUND : MESSAGES[err.kind];
    return { ...base, detail: err.detail, status: err.status };
  }
  return { ...MESSAGES.SERVER, detail: null, status: null };
}

export function ErrorBox({
  error,
  context = 'analyze',
  onRetry,
  onDemo,
}: {
  error: unknown;
  context?: 'analyze' | 'report';
  onRetry?: () => void;
  onDemo?: () => void;
}) {
  const { title, text, detail, status } = describeError(error, context);
  return (
    <Panel className="border-dry/30 p-5 sm:p-7">
      <div role="alert" className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-dry" aria-hidden />
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-1 max-w-prose text-muted">{text}</p>
            {detail && detail !== text && <p className="mt-2 max-w-prose text-sm">Komunikat serwera: {detail}</p>}
            {status && <p className="mt-1 text-xs text-muted">Kod błędu: {status}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-9">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 font-semibold text-white hover:bg-ink/85"
            >
              <RotateCcw className="size-4" aria-hidden /> Spróbuj ponownie
            </button>
          )}
          {onDemo && (
            <button
              type="button"
              onClick={onDemo}
              className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 font-semibold hover:bg-paper"
            >
              <Sparkles className="size-4" aria-hidden /> Załaduj przykład (demo)
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
