import { AlertCircle, Eye, RotateCcw } from 'lucide-react';
import type { TranslationDict } from '../i18n/translations';

interface ErrorBannerProps {
  t: TranslationDict;
  message: string;
  onRetry?: () => void;
  onOpenDemo?: () => void;
}

export function ErrorBanner({ t, message, onRetry, onOpenDemo }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="rounded-xl px-4 py-3.5"
      style={{
        backgroundColor: 'var(--risk-critical-soft)',
        border: '1px solid var(--risk-critical-ink)',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 shrink-0"
          style={{ color: 'var(--risk-critical-ink)' }}
          strokeWidth={2}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-bold leading-snug" style={{ color: 'var(--risk-critical-ink)' }}>
            {t.errorTitle}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
            {message}
          </p>
          {(onRetry || onOpenDemo) && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {onOpenDemo && (
                <button
                  type="button"
                  onClick={onOpenDemo}
                  className="btn-primary inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold"
                >
                  <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>{t.openDemoReport}</span>
                </button>
              )}
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="chip"
                  style={{ minHeight: 40 }}
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <span>{t.retryButton}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
