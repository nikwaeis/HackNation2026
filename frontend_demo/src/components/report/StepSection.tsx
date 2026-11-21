import type { ReactNode } from 'react';

function StepNumber({ number, className = '' }: { number: number; className?: string }) {
  return (
    <span
      className={`relative z-10 flex shrink-0 items-center justify-center rounded-full bg-ink font-display font-extrabold text-white ${className}`}
    >
      {number}
    </span>
  );
}

/**
 * One step of the fixed report sequence (1 → 4). On wider screens a rail on the left
 * connects the steps so the order is visible; on phones the number sits next to the title.
 */
export function StepSection({
  number,
  title,
  lead,
  id,
  children,
  last = false,
}: {
  number: number;
  title: string;
  lead?: string;
  id: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="relative grid grid-cols-1 sm:grid-cols-[3rem_1fr] sm:gap-x-5">
      <div className="relative hidden justify-center sm:flex" aria-hidden>
        <StepNumber number={number} className="size-12 text-xl" />
        {!last && <span className="absolute top-12 bottom-0 w-0.5 bg-line print:hidden" />}
      </div>
      <div className={`min-w-0 ${last ? '' : 'pb-10 sm:pb-14'}`}>
        <header className="mb-5 sm:pt-2 print:break-after-avoid">
          <div className="flex items-center gap-3 sm:block">
            <StepNumber number={number} className="size-10 text-lg sm:hidden" />
            <div>
              <p className="text-sm font-semibold text-muted">Krok {number} z 4</p>
              <h2 id={`${id}-title`} className="text-2xl font-bold sm:text-3xl">
                {title}
              </h2>
            </div>
          </div>
          {lead && <p className="mt-1.5 max-w-prose text-muted">{lead}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
