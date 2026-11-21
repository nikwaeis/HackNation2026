import { Search } from 'lucide-react';
import type { CropResponse } from '../types/api';
import type { UldkResolvedParcel } from '../api/uldk';
import {
  CROP_NAMES_EN,
  MONTHS_EN,
  MONTHS_PL,
  type Language,
  type TranslationDict,
} from '../i18n/translations';

interface ParcelFormProps {
  t: TranslationDict;
  lang: Language;
  crops: CropResponse[];
  dzialkaId: string;
  onChangeDzialkaId: (val: string) => void;
  onInsertSample: () => void;
  selectedParcel: UldkResolvedParcel | null;
  onClearSelectedParcel: () => void;
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
  onInsertSample,
  selectedParcel,
  onClearSelectedParcel,
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

  const locationLine = selectedParcel
    ? [selectedParcel.commune, selectedParcel.voivodeship].filter(Boolean).join(', ')
    : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h1
          className="text-xl font-bold leading-snug tracking-tight"
          style={{ color: 'var(--ink-primary)' }}
        >
          {t.formTitle}
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          {t.formLead}
        </p>
      </div>

      {/* Step 1: Parcel ID or highlighted parcel sector from map */}
      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <div className="flex items-baseline justify-between gap-2">
          <legend className="p-0 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
            {t.step1Label}
          </legend>
          {selectedParcel ? (
            <button
              type="button"
              onClick={onClearSelectedParcel}
              className="text-xs font-semibold underline underline-offset-4"
              style={{ color: 'var(--ink-secondary)' }}
            >
              {t.clearMapPoint}
            </button>
          ) : (
            <button
              type="button"
              onClick={onInsertSample}
              className="text-xs font-semibold underline underline-offset-4"
              style={{ color: 'var(--ink-secondary)' }}
            >
              {t.trySampleParcel}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="dzialka-id-input" className="sr-only">
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
            className="input-well tabular-nums h-11 w-full rounded-lg px-3.5 text-sm font-medium"
          />
          {locationLine ? (
            <p className="text-xs font-medium leading-relaxed" style={{ color: 'var(--brand-primary)' }}>
              {t.mapPointSelected}: {locationLine}
            </p>
          ) : (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
              {t.parcelInputHelp}
            </p>
          )}
        </div>
      </fieldset>

      {/* Step 2: Crop selection */}
      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <legend className="p-0 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          {t.step2Label}
        </legend>

        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
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
                className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm transition-colors"
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
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            {t.cropCriticalPrefix}{' '}
            <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}>
              {selectedCrop.criticalMonths.map((m) => monthNames[m - 1]).join(', ')}
            </span>
          </p>
        )}
      </fieldset>

      {/* Step 3: Assessment date */}
      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="p-0 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
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
                    boxShadow: active ? '0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <input
          id="target-date-input"
          type="date"
          min={minDate}
          max={maxDate}
          value={targetDate}
          onChange={(e) => onChangeTargetDate(e.target.value)}
          aria-label={t.step3Label}
          className="input-well tabular-nums h-11 w-full rounded-lg px-3.5 text-sm font-medium"
        />
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

      <div className="flex flex-col gap-3 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold disabled:opacity-60"
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
