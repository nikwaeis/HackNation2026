import { useState } from 'react';
import { Check, Database, Link2, Printer, RotateCcw, TriangleAlert } from 'lucide-react';
import type { SourcesAndLimitations } from '../../api/types';
import { dateLong } from '../../lib/format';
import { Badge } from '../ui';
import { StepSection } from './StepSection';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts (http on LAN)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function Step4SourcesAndLimitations({
  data,
  reportUuid,
  onNewAnalysis,
}: {
  data: SourcesAndLimitations;
  reportUuid: string;
  onNewAnalysis: () => void;
}) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const link = `${window.location.origin}/report/${reportUuid}`;

  async function handleCopy() {
    const ok = await copyText(link);
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <StepSection
      number={4}
      id="zrodla"
      title="Źródła danych i ograniczenia"
      lead="Skąd pochodzą dane, z jakiego dnia i czego ta analiza nie uwzględnia."
      last
    >
      <div className="flex flex-col gap-5">
        {/* Backend sends plain strings (name + date in the text); the older contract has date / mode columns */}
        {!data.sources.some((s) => s.date || s.mode) ? (
          data.sources.length > 0 && (
            <ul className="print-avoid-break overflow-hidden rounded-2xl border border-line bg-surface">
              {data.sources.map((s, i) => (
                <li key={s.name} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
                  <Database className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
                  <span>{s.name}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
        <div className="print-avoid-break overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left">
            <caption className="sr-only">Wykorzystane źródła danych</caption>
            <thead className="bg-paper text-sm text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Źródło</th>
                <th scope="col" className="hidden px-4 py-2.5 font-semibold sm:table-cell">Dane z dnia</th>
                <th scope="col" className="hidden px-4 py-2.5 font-semibold sm:table-cell">Pobranie</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => {
                const mode =
                  s.mode === 'LIVE' ? (
                    <Badge tone="water" title="Dane pobrane na bieżąco podczas tej analizy">Na żywo</Badge>
                  ) : s.mode === 'CACHED' ? (
                    <Badge tone="neutral" title="Dane zapisane wcześniej (rzadko się zmieniają, np. granice działek, gleba)">Z pamięci</Badge>
                  ) : null;
                return (
                  <tr key={`${s.name}-${s.date}`} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <span className="font-semibold">{s.name}</span>
                      {/* phones: date and mode stacked under the name */}
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted sm:hidden">
                        <span className="tabular-nums">{dateLong(s.date)}</span>
                        {mode}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap tabular-nums sm:table-cell">{dateLong(s.date)}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">{mode}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        {data.limitationsPl.length > 0 && (
          <div className="print-avoid-break rounded-2xl border border-ochre/30 bg-ochre-soft p-5 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <TriangleAlert className="size-5 text-ochre" aria-hidden /> O czym warto pamiętać
            </h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 marker:text-ochre">
              {data.limitationsPl.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink/75">
              Raport ma charakter doradczy. Przed inwestycją w nawadnianie lub budową urządzeń wodnych skonsultuj się z doradcą
              rolnym i sprawdź wymagane pozwolenia.
            </p>
          </div>
        )}

        <div className="no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 font-semibold text-white hover:bg-ink/85"
          >
            <Printer className="size-5" aria-hidden /> Pobierz raport PDF / Drukuj
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 py-3 font-semibold hover:bg-paper"
          >
            {copied === 'ok' ? <Check className="size-5 text-field" aria-hidden /> : <Link2 className="size-5" aria-hidden />}
            {copied === 'ok' ? 'Skopiowano link' : copied === 'fail' ? 'Nie udało się skopiować' : 'Kopiuj link do raportu'}
          </button>
          <button
            type="button"
            onClick={onNewAnalysis}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold text-water-deep hover:bg-water-soft"
          >
            <RotateCcw className="size-5" aria-hidden /> Nowa analiza
          </button>
        </div>
        <p className="no-print text-sm text-muted">
          W oknie drukowania wybierz „Zapisz jako PDF”, aby zapisać raport na telefonie lub komputerze. Link do raportu nie
          zawiera żadnych danych osobowych.
        </p>
        <p className="print-only text-xs text-muted">Raport online: {link}</p>
      </div>
    </StepSection>
  );
}
