import type { ReactNode } from 'react';
import type { Priority } from '../api/types';
import { PRIORITY_LABEL } from '../lib/format';

type Tone = 'field' | 'ochre' | 'dry' | 'water' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  field: 'bg-field-soft text-field border-field/25',
  ochre: 'bg-ochre-soft text-ochre border-ochre/25',
  dry: 'bg-dry-soft text-dry border-dry/25',
  water: 'bg-water-soft text-water-deep border-water/25',
  neutral: 'bg-paper text-muted border-line',
};

export function Badge({ tone = 'neutral', icon, children, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<Priority, Tone> = { HIGH: 'dry', MEDIUM: 'ochre', LOW: 'field' };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'}>{PRIORITY_LABEL[priority] ?? priority}</Badge>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}
