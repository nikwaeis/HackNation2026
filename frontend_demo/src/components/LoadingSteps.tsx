import { useEffect, useState } from 'react';
import { Check, CloudSun, Loader2, Mountain, Satellite, ScrollText, SquareDashed } from 'lucide-react';
import { Panel } from './ui';

const STEPS = [
  { icon: SquareDashed, label: 'Wyszukuję granice działki w ewidencji gruntów', startsAt: 0 },
  { icon: CloudSun, label: 'Pobieram dane pogodowe z ostatnich 10 lat', startsAt: 1.5 },
  { icon: Mountain, label: 'Sprawdzam ukształtowanie terenu i glebę', startsAt: 5 },
  { icon: Satellite, label: 'Analizuję zdjęcia satelitarne Sentinel-2', startsAt: 9 },
  { icon: ScrollText, label: 'Przygotowuję zalecenia', startsAt: 14 },
];

/** Scales the step timeline so the demo (≈4.5 s) also walks through all steps. */
export function LoadingSteps({ fast, onCancel }: { fast: boolean; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - started) / 1000), 250);
    return () => clearInterval(id);
  }, []);

  const scale = fast ? 0.28 : 1;
  const activeIndex = STEPS.reduce((acc, s, i) => (elapsed >= s.startsAt * scale ? i : acc), 0);

  return (
    <Panel className="p-5 sm:p-7">
      <div role="status" aria-live="polite" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-bold">Analizuję Twoje pole</h2>
          <span className="text-sm text-muted tabular-nums">
            {Math.floor(elapsed)} s (zwykle 5–20 sekund)
          </span>
        </div>

        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            const Icon = s.icon;
            return (
              <li
                key={s.label}
                className={`flex items-center gap-3 ${done ? 'text-ink' : active ? 'font-semibold text-ink' : 'text-muted/70'}`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${
                    done ? 'border-field bg-field text-white' : active ? 'border-water bg-water-soft text-water' : 'border-line'
                  }`}
                >
                  {done ? (
                    <Check className="size-4" aria-hidden />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="size-4" aria-hidden />
                  )}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>

        <div className="h-1.5 overflow-hidden rounded-full bg-paper">
          <div
            className="h-full rounded-full bg-water transition-[width] duration-500"
            style={{ width: `${Math.min(95, ((activeIndex + 0.5) / STEPS.length) * 100)}%` }}
          />
        </div>

        <button type="button" onClick={onCancel} className="self-start text-sm font-semibold text-muted underline underline-offset-4 hover:text-ink">
          Anuluj analizę
        </button>
      </div>
    </Panel>
  );
}
