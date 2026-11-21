import { CircleCheck, CircleSlash, Droplet, FileWarning, Info, ShowerHead } from 'lucide-react';
import type { Irrigation } from '../../api/types';
import { num, urgencyLabel } from '../../lib/format';
import { Badge } from '../ui';
import { StepSection } from './StepSection';

function urgencyTone(urgency: string | null) {
  switch (urgency?.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'dry' as const;
    case 'MODERATE':
    case 'MEDIUM':
      return 'ochre' as const;
    default:
      return 'field' as const;
  }
}

export function Step3Irrigation({ data }: { data: Irrigation }) {
  return (
    <StepSection
      number={3}
      id="nawadnianie"
      title="Nawadnianie"
      lead="Rozważ dopiero wtedy, gdy zatrzymanie wody z kroku 2 nie wystarczy."
    >
      <div className="print-avoid-break rounded-2xl border-2 border-dashed border-water/40 bg-water-soft/60 p-5 sm:p-6">
        <p className="flex items-start gap-2 text-sm text-water-deep">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Nawadnianie to działanie uzupełniające. Najpierw zatrzymaj wodę opadową na polu — to tańsze i działa przez wiele sezonów.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-2 font-display text-2xl font-bold sm:text-3xl ${data.isRecommended ? 'text-water-deep' : 'text-field'}`}
          >
            {data.isRecommended ? <CircleCheck className="size-7" aria-hidden /> : <CircleSlash className="size-7" aria-hidden />}
            {data.isRecommended ? 'Nawadnianie zalecane' : 'Nawadnianie nie jest teraz potrzebne'}
          </span>
          {data.urgency && <Badge tone={urgencyTone(data.urgency)}>{urgencyLabel(data.urgency)}</Badge>}
          {data.isRecommended && data.doseMm != null && (
            <Badge tone="water" icon={<Droplet className="size-3.5" aria-hidden />} title="Jednorazowa dawka wody">
              Dawka: {num(data.doseMm)} mm ({num(data.doseMm * 10)} m³/ha)
            </Badge>
          )}
        </div>

        <p className="mt-3 flex max-w-prose items-start gap-2 text-lg leading-relaxed">
          <ShowerHead className="mt-1 size-5 shrink-0 text-water" aria-hidden />
          {data.advicePl}
        </p>

        {data.waterSourceNotePl && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface px-4 py-3 text-sm">
            <FileWarning className="mt-0.5 size-4 shrink-0 text-ochre" aria-hidden />
            <span>
              <strong>Źródło wody i pozwolenia: </strong>
              {data.waterSourceNotePl}
            </span>
          </p>
        )}
      </div>
    </StepSection>
  );
}
