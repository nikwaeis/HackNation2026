import type { ComponentType } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bean,
  CalendarDays,
  Carrot,
  Check,
  Flower2,
  Loader2,
  MapPin,
  Search,
  Sprout,
  Wheat,
  X,
  type LucideProps,
} from 'lucide-react';
import type { TerritoryVerdict } from '../api/territory';
import type { CropResponse } from '../types/api';
import type { UldkParcel } from '../api/uldk';
import {
  CROP_NAMES_EN,
  MONTHS_EN,
  MONTHS_PL,
  type Language,
  type TranslationDict,
} from '../i18n/translations';
import { SAMPLE_PARCEL_ID } from '../api/mockData';

export type TerritoryCheck = { status: 'checking' } | { status: 'done'; verdict: TerritoryVerdict };

export interface ParcelLookup {
  status: 'idle' | 'loading' | 'found' | 'notFound' | 'unavailable';
  source: 'point' | 'id' | null;
  parcel: UldkParcel | null;
  /** Land-type check of the found parcel (OSM): field / built-up / unverified */
  territory?: TerritoryCheck;
  /** The farmer confirmed a parcel that looked built-up / non-agricultural */
  confirmed?: boolean;
}

/** True while the found parcel looks built-up and the farmer has not confirmed it */
export function needsTerritoryConfirmation(lookup: ParcelLookup): boolean {
  return (
    lookup.status === 'found' &&
    lookup.territory?.status === 'done' &&
    lookup.territory.verdict.kind === 'warn' &&
    !lookup.confirmed
  );
}

interface ParcelFormProps {
  t: TranslationDict;
  lang: Language;
  crops: CropResponse[];
  dzialkaId: string;
  onChangeDzialkaId: (val: string) => void;
  selectedPoint: { lat: number; lon: number } | null;
  onClearPoint: () => void;
  lookup: ParcelLookup;
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
  /** Accept a parcel that looked built-up (e.g. a large field with a farm building) */
  onConfirmTerritory: () => void;
}

const CROP_ICONS: Record<string, ComponentType<LucideProps>> = {
  winter_wheat: Wheat,
  maize: Sprout,
  rapeseed: Flower2,
  sugar_beet: Carrot,
  potato: Bean,
};

/** [5, 6, 7] → "maj – lipiec"; non-contiguous → "kwiecień, czerwiec" */
function monthsRange(months: number[], names: string[]): string {
  if (months.length === 0) return '';
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 1) return `${names[sorted[0] - 1]} – ${names[sorted[sorted.length - 1] - 1]}`;
  return sorted.map((m) => names[m - 1]).join(', ');
}

function formatHa(value: number, lang: Language): string {
  return new Intl.NumberFormat(lang === 'pl' ? 'pl-PL' : 'en-GB', { maximumFractionDigits: 2 }).format(value);
}

function StepHeading({ number, label, aside }: { number: number; label: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <legend className="flex items-center gap-2.5 p-0 text-[0.95rem] font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
        <span aria-hidden="true" className="step-badge">
          {number}
        </span>
        {label.replace(/^\d+\.\s*/, '')}
      </legend>
      {aside}
    </div>
  );
}

function TerritoryNote({
  t,
  lookup,
  onPickOther,
  onConfirm,
}: {
  t: TranslationDict;
  lookup: ParcelLookup;
  onPickOther: () => void;
  onConfirm: () => void;
}) {
  const check = lookup.territory;
  if (lookup.status !== 'found' || !check) return null;

  if (check.status === 'checking') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t.territoryChecking}
      </p>
    );
  }

  const v = check.verdict;
  if (v.kind === 'unverified') {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
        {t.territoryUnverified}
      </p>
    );
  }

  const sourceLabel = (source: 'egib' | 'osm') => (source === 'egib' ? t.territorySourceEgib : t.territorySourceOsm);

  if (v.kind === 'field') {
    return (
      <span className="tag mt-2 !whitespace-normal" style={{ backgroundColor: '#d1fae5', color: 'var(--emerald-ink)' }}>
        <Wheat className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {t.fieldKinds[v.field]}
          {v.code && <span className="num"> ({v.code})</span>} · {sourceLabel(v.source)}
        </span>
      </span>
    );
  }

  if (lookup.confirmed) {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium leading-relaxed" style={{ color: 'var(--emerald-ink)' }}>
        <Check className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.75} aria-hidden="true" />
        {t.territoryConfirmed}
      </p>
    );
  }

  return (
    <div role="alert" className="rise-in mt-3 rounded-xl px-3.5 py-3" style={{ backgroundColor: '#fffbeb', border: '1.5px solid #f59e0b' }}>
      <p className="flex items-start gap-2 text-sm font-semibold leading-snug" style={{ color: '#78350f' }}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#d97706' }} strokeWidth={2.25} aria-hidden="true" />
        {t.territoryWarnTitle}
      </p>
      <p className="mt-1 pl-6 text-xs leading-relaxed" style={{ color: '#92400e' }}>
        {t.territoryReasons[v.reason]}
        {v.code && (
          <>
            {' '}
            {t.territoryCodeLabel}: <strong className="num">{v.code}</strong>.
          </>
        )}{' '}
        ({sourceLabel(v.source)})
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
        <button type="button" onClick={onPickOther} className="chip" style={{ borderColor: '#f59e0b', color: '#78350f' }}>
          <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
          {t.territoryPickOther}
        </button>
        <button type="button" onClick={onConfirm} className="chip">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          {t.territoryConfirm}
        </button>
      </div>
    </div>
  );
}

function ParcelTags({ parcel, lang }: { parcel: UldkParcel; lang: Language }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="tag num">{formatHa(parcel.areaHa, lang)} ha</span>
      {parcel.voivodeship && <span className="tag">{parcel.voivodeship}</span>}
    </span>
  );
}

export function ParcelForm({
  t,
  lang,
  crops,
  dzialkaId,
  onChangeDzialkaId,
  selectedPoint,
  onClearPoint,
  lookup,
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
  onConfirmTerritory,
}: ParcelFormProps) {
  const monthNames = lang === 'pl' ? MONTHS_PL : MONTHS_EN;

  const datePresets = [
    { label: t.dateToday, value: maxDate },
    { label: t.dateSummer2024, value: '2024-07-15' },
    { label: t.dateSummer2022, value: '2022-07-15' },
  ].filter((p) => p.value >= minDate && p.value <= maxDate);

  const pointLookup = lookup.source === 'point' ? lookup : null;
  const idLookup = lookup.source === 'id' ? lookup : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-lg font-bold leading-snug tracking-tight" style={{ color: 'var(--ink-primary)' }}>
          {t.formTitle}
        </h1>
        <p className="text-[0.8rem] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          {t.formLead}
        </p>
      </div>

      {/* Step 1: Parcel ID or map click */}
      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <StepHeading
          number={1}
          label={t.step1Label}
          aside={
            !selectedPoint && (
              <button type="button" onClick={() => onChangeDzialkaId(SAMPLE_PARCEL_ID)} className="link-btn text-xs">
                {t.trySampleParcel}
              </button>
            )
          }
        />

        {selectedPoint ? (
          <div
            className="rise-in rounded-xl px-4 py-3"
            style={{
              backgroundColor:
                pointLookup?.status === 'found' && !needsTerritoryConfirmation(lookup) ? 'var(--emerald-soft)' : 'var(--bg-field)',
              border: `1.5px solid ${
                pointLookup?.status === 'found'
                  ? needsTerritoryConfirmation(lookup)
                    ? '#f59e0b'
                    : 'var(--emerald)'
                  : 'var(--hairline)'
              }`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                {pointLookup?.status === 'loading' ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--water-accent)' }} aria-hidden="true" />
                ) : pointLookup?.status === 'found' && needsTerritoryConfirmation(lookup) ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#d97706' }} strokeWidth={2.25} aria-hidden="true" />
                ) : pointLookup?.status === 'found' ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--emerald)' }} strokeWidth={2.75} aria-hidden="true" />
                ) : (
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ink-primary)' }} strokeWidth={1.9} aria-hidden="true" />
                )}
                <div className="min-w-0" aria-live="polite">
                  {pointLookup?.status === 'found' && pointLookup.parcel ? (
                    <>
                      <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                        {t.parcelSelected}
                      </p>
                      <p className="num break-all text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                        {pointLookup.parcel.id}
                      </p>
                      <div className="mt-1.5">
                        <ParcelTags parcel={pointLookup.parcel} lang={lang} />
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
                        {pointLookup?.status === 'loading' ? t.parcelLookupLoading : t.mapPointSelected}
                      </p>
                      <p className="num text-xs" style={{ color: 'var(--ink-secondary)' }}>
                        {selectedPoint.lat.toFixed(5)}° N, {selectedPoint.lon.toFixed(5)}° E
                      </p>
                    </>
                  )}
                </div>
              </div>
              <button type="button" onClick={onClearPoint} className="chip shrink-0" aria-label={t.clearMapPoint}>
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                {t.clearSelection}
              </button>
            </div>
            <TerritoryNote t={t} lookup={lookup} onPickOther={onClearPoint} onConfirm={onConfirmTerritory} />
            {(pointLookup?.status === 'notFound' || pointLookup?.status === 'unavailable') && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed" style={{ color: 'var(--risk-moderate-ink)' }}>
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pointLookup.status === 'notFound' ? t.parcelLookupNotFound : t.parcelLookupUnavailable}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="dzialka-id-input" className="sr-only">
              {t.parcelInputLabel}
            </label>
            <div className="relative">
              <MapPin
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: idLookup?.status === 'found' ? 'var(--emerald)' : 'var(--ink-muted)' }}
                strokeWidth={2}
                aria-hidden="true"
              />
              <input
                id="dzialka-id-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                value={dzialkaId}
                onChange={(e) => onChangeDzialkaId(e.target.value)}
                placeholder={t.parcelInputPlaceholder}
                className="input-well num h-12 w-full rounded-xl pl-10 pr-10 text-sm font-semibold"
              />
              {idLookup?.status === 'loading' && (
                <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" style={{ color: 'var(--emerald)' }} aria-hidden="true" />
              )}
              {idLookup?.status === 'found' && (
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--emerald)' }}
                >
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </span>
              )}
            </div>
            {idLookup && idLookup.status !== 'idle' ? (
              <div
                aria-live="polite"
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs font-medium"
                style={{
                  color:
                    idLookup.status === 'found'
                      ? 'var(--emerald-ink)'
                      : idLookup.status === 'loading'
                        ? 'var(--ink-muted)'
                        : 'var(--risk-moderate-ink)',
                }}
              >
                {idLookup.status === 'loading' && t.parcelLookupLoading}
                {idLookup.status === 'found' && idLookup.parcel && (
                  <>
                    <span>{t.parcelIdFound}</span>
                    <ParcelTags parcel={idLookup.parcel} lang={lang} />
                  </>
                )}
                {idLookup.status === 'notFound' && t.parcelIdNotFound}
                {idLookup.status === 'unavailable' && t.parcelIdUnavailable}
              </div>
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                {t.parcelInputHelp}
              </p>
            )}
            {idLookup && (
              <TerritoryNote t={t} lookup={lookup} onPickOther={() => onChangeDzialkaId('')} onConfirm={onConfirmTerritory} />
            )}
          </div>
        )}
      </fieldset>

      {/* Step 2: Crop cards */}
      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <StepHeading number={2} label={t.step2Label} />
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t.step2Label}>
          {crops.map((crop) => {
            const active = crop.id === cropId;
            const displayName = lang === 'en' ? CROP_NAMES_EN[crop.id] || crop.namePl : crop.namePl;
            const Icon = CROP_ICONS[crop.id] ?? Sprout;
            const months = monthsRange(crop.criticalMonths, monthNames);
            return (
              <button
                key={crop.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChangeCropId(crop.id)}
                className="crop-card flex flex-col justify-center px-3 py-2.5 text-left"
              >
                <span className="flex w-full items-center gap-2.5">
                  <span className="crop-card__icon" aria-hidden="true">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{displayName}</span>
                  {active && (
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: 'var(--emerald)' }}
                    >
                      <Check className="h-3 w-3 text-white" strokeWidth={3.25} />
                    </span>
                  )}
                </span>
                {active && months && (
                  <span className="crop-card__months rise-in">
                    {t.criticalMonthsLong}: {months}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Step 3: Assessment date */}
      <fieldset className="flex flex-col gap-2.5 border-0 p-0">
        <StepHeading number={3} label={t.step3Label} />
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[170px] flex-1">
            <CalendarDays
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: 'var(--ink-muted)' }}
              strokeWidth={2}
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
              className="input-well num h-12 w-full rounded-xl pl-10 pr-3 text-sm font-semibold"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.step3Label}>
            {datePresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChangeTargetDate(preset.value)}
                aria-pressed={targetDate === preset.value}
                className="date-pill"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          {t.dateHelp}
        </p>
      </fieldset>

      {validationError && (
        <p
          role="alert"
          className="rise-in rounded-xl px-3.5 py-2.5 text-sm font-semibold"
          style={{ color: 'var(--risk-critical-ink)', backgroundColor: 'var(--risk-critical-soft)' }}
        >
          {validationError}
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          data-busy={submitting}
          className="btn-cta flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-base font-semibold"
        >
          {submitting ? (
            <span className="relative flex h-4 w-4 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-white" />
            </span>
          ) : (
            <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={2.4} aria-hidden="true" />
          )}
          <span className={submitting ? 'animate-pulse' : undefined}>{submitting ? t.submittingButton : t.submitButton}</span>
        </button>

        {onOpenDemo && (
          <button type="button" onClick={onOpenDemo} className="link-btn text-sm">
            {t.openDemoReport}
          </button>
        )}
      </div>
    </form>
  );
}
