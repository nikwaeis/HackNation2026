import { Calendar, MapPin, Search } from 'lucide-react';
import type { CropResponse } from '../types/api';
import {
  CROP_NAMES_EN,
  MONTHS_EN,
  MONTHS_PL,
  type Language,
  type TranslationDict,
} from '../i18n/translations';
import { SAMPLE_PARCEL_ID } from '../api/mockData';

interface ParcelFormProps {
  t: TranslationDict;
  lang: Language;
  crops: CropResponse[];
  dzialkaId: string;
  onChangeDzialkaId: (val: string) => void;
  selectedPoint: { lat: number; lon: number } | null;
  onClearPoint: () => void;
  cropId: string;
  onChangeCropId: (id: string) => void;
  targetDate: string;
  onChangeTargetDate: (val: string) => void;
  minDate: string;
  maxDate: string;
  submitting: boolean;
  validationError: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onOpenDemo?: () => void;
}

export function ParcelForm({
  t,
  lang,
  crops,
  dzialkaId,
  onChangeDzialkaId,
  selectedPoint,
  onClearPoint,
  cropId,
  onChangeCropId,
  targetDate,
  onChangeTargetDate,
  minDate,
  maxDate,
  submitting,
  validationError,
  onSubmit,
  onOpenDemo,
}: ParcelFormProps) {
  const selectedCrop = crops.find((c) => c.id === cropId) ?? null;
  const monthNames = lang === 'pl' ? MONTHS_PL : MONTHS_EN;

  const datePresets = [
    { label: t.dateToday, value: maxDate },
    { label: t.dateSummer2024, value: '2024-07-15' },
    { label: t.dateSummer2022, value: '2022-07-15' },
  ].filter((p) => p.value >= minDate && p.value <= maxDate);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h1
          className="text-xl font-bold leading-snug tracking-tight"
          style={{ color: 'var(--ink-primary)' }}
        >
          {t.formTitle}
        </h1>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          {t.formLead}
        </p>
      </div>

      {/* Step 1: Parcel ID or Map Point */}
      <fieldset className="m-0 space-y-2 border-0 p-0">
        <legend className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          {t.step1Label}
        </legend>

        {selectedPoint ? (
          <div
            className="flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5"
            style={{ backgroundColor: 'var(--bg-field)' }}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <MapPin
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--ink-primary)' }}
                strokeWidth={1.9}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {t.mapPointSelected}
                </p>
                <p className="tabular-nums text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  {selectedPoint.lat.toFixed(5)}° N, {selectedPoint.lon.toFixed(5)}° E
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearPoint}
              className="shrink-0 text-sm font-semibold underline underline-offset-4"
              style={{ color: 'var(--ink-primary)' }}
            >
              {t.clearMapPoint}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label
              htmlFor="dzialka-id-input"
              className="sr-only"
            >
              {t.parcelInputLabel}
            </label>
            <input
              id="dzialka-id-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={dzialkaId}
              onChange={(e) => onChangeDzialkaId(e.target.value)}
              placeholder={t.parcelInputPlaceholder}
              className="input-well tabular-nums h-11 w-full rounded-xl px-3.5 text-sm font-medium"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 text-xs">
              <span style={{ color: 'var(--ink-muted)' }}>{t.parcelInputHelp}</span>
              <button
                type="button"
                onClick={() => onChangeDzialkaId(SAMPLE_PARCEL_ID)}
                className="font-semibold underline underline-offset-4"
                style={{ color: 'var(--ink-primary)' }}
              >
                {t.trySampleParcel}
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* Step 2: Crop selection — explicit radio indicators so affordance is unmistakable */}
      <fieldset className="m-0 space-y-2 border-0 p-0">
        <legend className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          {t.step2Label}
        </legend>

        <div
          className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t.step2Label}
        >
          {crops.map((crop) => {
            const active = crop.id === cropId;
            const displayName = lang === 'en' ? CROP_NAMES_EN[crop.id] || crop.namePl : crop.namePl;
            return (
              <button
                key={crop.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChangeCropId(crop.id)}
                className="flex min-h-[42px] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                style={{
                  backgroundColor: active ? 'var(--bg-hover)' : 'var(--bg-field)',
                  color: 'var(--ink-primary)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                  style={{
                    borderColor: active ? 'var(--brand-primary)' : 'var(--field-border-hover)',
                  }}
                >
                  {active && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    />
                  )}
                </span>
                <span className="leading-snug">{displayName}</span>
              </button>
            );
          })}
        </div>

        {selectedCrop && selectedCrop.criticalMonths.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            {t.cropCriticalPrefix}{' '}
            <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>
              {selectedCrop.criticalMonths.map((m) => monthNames[m - 1]).join(', ')}
            </span>
          </p>
        )}
      </fieldset>

      {/* Step 3: Assessment date */}
      <fieldset className="m-0 space-y-2 border-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            {t.step3Label}
          </legend>
          <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: 'var(--bg-field)' }}>
            {datePresets.map((preset) => {
              const active = targetDate === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onChangeTargetDate(preset.value)}
                  aria-pressed={active}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--ink-primary)' : 'var(--ink-muted)',
                    boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <Calendar
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: 'var(--ink-muted)' }}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            id="target-date-input"
            type="date"
            min={minDate}
            max={maxDate}
            value={targetDate}
            onChange={(e) => onChangeTargetDate(e.target.value)}
            aria-label={t.step3Label}
            className="input-well tabular-nums h-11 w-full rounded-xl pl-10 pr-3.5 text-sm font-medium"
          />
        </div>
      </fieldset>

      {validationError && (
        <p
          role="alert"
          className="text-sm font-semibold"
          style={{ color: 'var(--risk-critical-ink)' }}
        >
          {validationError}
        </p>
      )}

      <div className="space-y-2.5 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold disabled:opacity-60"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
          <span>{submitting ? t.submittingButton : t.submitButton}</span>
        </button>

        {onOpenDemo && (
          <div className="text-center">
            <button
              type="button"
              onClick={onOpenDemo}
              className="text-xs font-semibold underline underline-offset-4"
              style={{ color: 'var(--ink-muted)' }}
            >
              {t.openDemoReport}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
