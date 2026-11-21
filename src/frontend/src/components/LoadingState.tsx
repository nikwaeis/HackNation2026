import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { TranslationDict } from '../i18n/translations';

interface LoadingStateProps {
  t: TranslationDict;
}

export function LoadingState({ t }: LoadingStateProps) {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [t.loadingStep1, t.loadingStep2, t.loadingStep3, t.loadingStep4];

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2400);
    return () => window.clearInterval(id);
  }, [steps.length]);

  return (
    <section
      aria-live="polite"
      className="mx-auto max-w-xl py-8"
    >
      <div className="flex items-center gap-3">
        <Loader2
          className="h-6 w-6 shrink-0 animate-spin"
          style={{ color: 'var(--brand-primary)' }}
          strokeWidth={2}
          aria-hidden="true"
        />
        <h2 className="text-xl font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
          {t.loadingTitle}
        </h2>
      </div>

      <p className="mt-2 text-base" style={{ color: 'var(--ink-secondary)' }}>
        {t.loadingSubtitle}
      </p>

      <div
        className="mt-6 h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--bg-field)' }}
        aria-hidden="true"
      >
        <div
          className="wodoplon-progress-bar h-full w-2/5 rounded-full"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        />
      </div>

      <ol className="mt-7 space-y-3.5">
        {steps.map((label, idx) => {
          const done = idx < activeStep;
          const current = idx === activeStep;
          return (
            <li
              key={label}
              className="flex items-center gap-3.5 text-base"
              style={{
                color: done || current ? 'var(--ink-primary)' : 'var(--ink-muted)',
                fontWeight: current ? 600 : 400,
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  backgroundColor: done
                    ? 'var(--ink-primary)'
                    : current
                      ? 'var(--bg-hover)'
                      : 'var(--bg-field)',
                  color: done
                    ? 'var(--bg-surface)'
                    : current
                      ? 'var(--ink-primary)'
                      : 'var(--ink-muted)',
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> : idx + 1}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
