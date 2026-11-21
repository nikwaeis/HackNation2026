import { Database } from 'lucide-react';
import type { AnalysisReport } from '../../api/types';
import { dateLong, dateTime, num } from '../../lib/format';
import { Badge } from '../ui';
import { ParcelShape } from './ParcelShape';

export function ReportHeader({ report }: { report: AnalysisReport }) {
  const { meta } = report;
  const facts: { label: string; value: string }[] = [
    { label: 'Uprawa', value: meta.cropNamePl },
    { label: 'Dzień analizy', value: dateLong(meta.targetDate) },
    { label: 'Powierzchnia', value: meta.areaHa != null ? `${num(meta.areaHa, 2)} ha` : '—' },
    { label: 'Województwo', value: meta.voivodeship ?? '—' },
  ];

  return (
    <header className="print-avoid-break flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-7">
      <ParcelShape geometry={report.geometry} className="size-24 shrink-0 sm:size-28" />
      <div className="min-w-0 flex-1">
        <p className="print-only mb-1 text-sm font-semibold">WodoPlon — raport wodny dla działki rolnej</p>
        <p className="text-sm font-semibold text-muted">Raport dla działki</p>
        <h2 className="text-2xl font-extrabold break-all sm:text-3xl">{meta.dzialkaId}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-muted">{f.label}</dt>
              <dd className="font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          {meta.generatedAt && <span>Wygenerowano {dateTime(meta.generatedAt)}</span>}
          {meta.fromCache && (
            <Badge tone="neutral" icon={<Database className="size-3.5" aria-hidden />} title="Raport odtworzony z zapisanej wcześniej analizy">
              Zapisana analiza
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}
