import { CalendarDays, Droplets, MapPin, Sprout, X } from 'lucide-react';
import type { FormEvent } from 'react';
import type { Crop } from '../api/types';
import { DZIALKA_ID_PATTERN, monthsLabel, tenYearsAgoIso, todayIso } from '../lib/format';

export interface FormState {
  dzialkaId: string;
  point: { lat: number; lon: number } | null;
  cropId: string;
  targetDate: string;
}

export function validateForm(form: FormState): string | null {
  const id = form.dzialkaId.trim();
  if (!id && !form.point) return 'Wpisz numer działki albo kliknij swoje pole na mapie.';
  if (id && !DZIALKA_ID_PATTERN.test(id))
    return 'Numer działki ma nieprawidłowy format. Przykład: 040101_1.0001.123/4 (znajdziesz go w wypisie z rejestru gruntów lub na Geoportalu).';
  if (!form.cropId) return 'Wybierz uprawę.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.targetDate)) return 'Wybierz datę analizy.';
  if (form.targetDate > todayIso()) return 'Data analizy nie może być z przyszłości.';
  if (form.targetDate < tenYearsAgoIso()) return 'Możesz wybrać datę z ostatnich 10 lat.';
  return null;
}

interface Props {
  form: FormState;
  crops: Crop[];
  cropsFromFallback: boolean;
  busy: boolean;
  validationError: string | null;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: () => void;
}

const fieldClass =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted/70 focus:border-water focus:outline-none focus:ring-2 focus:ring-water/30 disabled:opacity-60';

export function ParamsPanel({ form, crops, cropsFromFallback, busy, validationError, onChange, onSubmit }: Props) {
  const selectedCrop = crops.find((c) => c.id === form.cropId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2.5" disabled={busy}>
        <legend className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <MapPin className="size-5 text-water" aria-hidden /> Twoje pole
        </legend>
        <label htmlFor="dzialkaId" className="text-sm font-semibold text-muted">
          Numer działki ewidencyjnej
        </label>
        <input
          id="dzialkaId"
          className={`${fieldClass} font-semibold tracking-wide`}
          placeholder="040101_1.0001.123/4"
          value={form.dzialkaId}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          onChange={(e) => onChange({ dzialkaId: e.target.value, point: e.target.value.trim() ? null : form.point })}
        />

        <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" /> albo <span className="h-px flex-1 bg-line" />
        </div>

        {form.point ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-water/30 bg-water-soft px-3.5 py-2.5">
            <div className="text-sm">
              <div className="font-semibold text-water-deep">Punkt wskazany na mapie</div>
              <div className="text-muted tabular-nums">
                {form.point.lat.toFixed(5)}° N, {form.point.lon.toFixed(5)}° E
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange({ point: null })}
              className="rounded-lg p-1.5 text-water-deep hover:bg-white/70"
              aria-label="Usuń punkt z mapy"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-2.5 text-sm text-muted">
            Kliknij swoje pole na mapie — numer działki ustalimy automatycznie.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <Sprout className="size-5 text-field" aria-hidden /> Uprawa
        </legend>
        <label htmlFor="crop" className="sr-only">
          Uprawa
        </label>
        <select id="crop" className={fieldClass} value={form.cropId} onChange={(e) => onChange({ cropId: e.target.value })}>
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.namePl}
            </option>
          ))}
        </select>
        {selectedCrop && selectedCrop.criticalMonths.length > 0 && (
          <p className="text-sm text-muted">
            Najbardziej potrzebuje wody: <strong className="text-ink">{monthsLabel(selectedCrop.criticalMonths)}</strong>
          </p>
        )}
        {cropsFromFallback && (
          <p className="text-xs text-muted">Lista upraw wczytana lokalnie — serwer chwilowo nie odpowiada.</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <CalendarDays className="size-5 text-ochre" aria-hidden /> Dzień analizy
        </legend>
        <label htmlFor="targetDate" className="sr-only">
          Dzień analizy
        </label>
        <input
          id="targetDate"
          type="date"
          className={fieldClass}
          value={form.targetDate}
          min={tenYearsAgoIso()}
          max={todayIso()}
          onChange={(e) => onChange({ targetDate: e.target.value })}
        />
        <p className="text-sm text-muted">Domyślnie dzisiaj. Możesz sprawdzić dowolny dzień z ostatnich 10 lat.</p>
      </fieldset>

      {validationError && (
        <p role="alert" className="rounded-xl border border-dry/30 bg-dry-soft px-3.5 py-2.5 text-sm font-semibold text-dry">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-xl bg-water px-5 py-3.5 font-display text-lg font-bold text-white transition-colors hover:bg-water-deep disabled:cursor-wait disabled:opacity-70"
      >
        <Droplets className="size-5" aria-hidden />
        {busy ? 'Analizuję…' : 'Sprawdź sytuację wodną'}
      </button>
    </form>
  );
}
