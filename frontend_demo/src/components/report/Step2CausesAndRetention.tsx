import { Layers, Search, Trees } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CausesAndRetention, Recommendation } from '../../api/types';
import { PRIORITY_ORDER } from '../../lib/format';
import { Panel, PriorityBadge } from '../ui';
import { StepSection } from './StepSection';

function byPriority(list: Recommendation[]): Recommendation[] {
  // stable sort: items without a priority keep the backend's order
  const rank = (r: Recommendation) => (r.priority ? PRIORITY_ORDER[r.priority] : 1);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

function RecommendationGroup({
  icon,
  title,
  description,
  items,
  accent,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  items: Recommendation[];
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${accent}`}>{icon}</span>
        <div>
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          Brak zaleceń w tej grupie dla tej działki.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {byPriority(items).map((r) => (
            <li key={r.actionPl}>
              <Panel className="print-avoid-break p-4 sm:p-5">
                {r.priority && (
                  <div className="mb-2">
                    <PriorityBadge priority={r.priority} />
                  </div>
                )}
                <p className="text-lg font-bold leading-snug">{r.actionPl}</p>
                {r.justificationPl && (
                  <p className="mt-1 text-ink/80">
                    <span className="font-semibold text-muted">Dlaczego: </span>
                    {r.justificationPl}
                  </p>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Step2CausesAndRetention({ data }: { data: CausesAndRetention }) {
  return (
    <StepSection
      number={2}
      id="przyczyny"
      title="Przyczyny niedoboru i zatrzymanie wody"
      lead="Skąd bierze się brak wody i jak zatrzymać więcej deszczu na polu i w jego okolicy."
    >
      <div className="flex flex-col gap-8">
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-xl font-bold">
            <Search className="size-5 text-dry" aria-hidden /> Wykryte przyczyny
          </h3>
          {data.identifiedCauses.length === 0 ? (
            <p className="text-muted">Nie wykryto szczególnych przyczyn niedoboru wody.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {data.identifiedCauses.map((c) => (
                <li key={c.code} className="print-avoid-break rounded-xl border border-line border-l-4 border-l-dry bg-surface p-4 sm:p-5">
                  {c.descriptionPl ? (
                    <>
                      <p className="text-lg font-bold leading-snug">{c.titlePl}</p>
                      <p className="mt-1 text-ink/80">{c.descriptionPl}</p>
                    </>
                  ) : (
                    <p className="text-lg leading-snug">{c.titlePl}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <RecommendationGroup
            icon={<Trees className="size-5" aria-hidden />}
            accent="bg-field-soft text-field"
            title="Retencja krajobrazowa"
            description="Zatrzymanie wody w okolicy pola: zastawki na rowach melioracyjnych, zadrzewienia, strefy buforowe."
            items={data.landscapeRetentionRecommendations}
          />
          <RecommendationGroup
            icon={<Layers className="size-5" aria-hidden />}
            accent="bg-ochre-soft text-ochre"
            title="Retencja glebowa i agrotechnika"
            description="Gleba jako magazyn wody: międzyplony, resztki pożniwne, sposób uprawy."
            items={data.soilAndAgroRecommendations}
          />
        </div>
      </div>
    </StepSection>
  );
}
