import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { TranslationDict } from '../i18n/translations';

interface LoadingStateProps {
  t: TranslationDict;
  /** page: standalone card; floating: glass card over the map; inline: compact block inside a panel */
  variant?: 'page' | 'floating' | 'inline';
}

export function LoadingState({ t, variant = 'page' }: LoadingStateProps) {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [t.loadingStep1, t.loadingStep2, t.loadingStep3, t.loadingStep4];

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2400);
    return () => window.clearInterval(id);
  }, [steps.length]);

  const shell =
    variant === 'floating'
      ? 'glass-sheet rise-in p-6'
      : variant === 'inline'
        ? 'rounded-2xl p-4'
        : 'card mx-auto max-w-xl p-6 sm:p-8';

  return (
    <section
      aria-live="polite"
      className={shell}
      style={variant === 'inline' ? { backgroundColor: 'var(--bg-field)', border: '1px solid var(--hairline)' } : undefined}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--brand-soft)' }}>
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-primary)' }} strokeWidth={2.25} aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold leading-snug tracking-tight" style={{ color: 'var(--ink-primary)' }}>
          {t.loadingTitle}
        </h2>
      </div>

      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
        {t.loadingSubtitle}
      </p>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }} aria-hidden="true">
        <div
          className="wodoplon-progress-bar h-full w-2/5 rounded-full"
          style={{ backgroundImage: 'linear-gradient(90deg, #1b5e20, #00b8d4)' }}
        />
      </div>

      <ol className="mt-5 space-y-3">
        {steps.map((label, idx) => {
          const done = idx < activeStep;
          const current = idx === activeStep;
          return (
            <li
              key={label}
              className="flex items-center gap-3 text-sm"
              style={{
                color: done || current ? 'var(--ink-primary)' : 'var(--ink-muted)',
                fontWeight: current ? 600 : 400,
              }}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${current ? 'animate-pulse' : ''}`}
                style={{
                  backgroundColor: done ? 'var(--brand-primary)' : current ? 'var(--brand-soft)' : 'var(--bg-hover)',
                  color: done ? '#ffffff' : current ? 'var(--brand-primary)' : 'var(--ink-muted)',
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : idx + 1}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
