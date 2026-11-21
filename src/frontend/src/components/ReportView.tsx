import { useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  CloudOff,
  CloudRain,
  Database,
  Droplets,
  FileDown,
  History,
  Info,
  Leaf,
  Link2,
  Mountain,
  Satellite,
  Search,
  ShieldCheck,
  Sprout,
  Sun,
  Trees,
  TriangleAlert,
  Waves,
  Wheat,
  type LucideProps,
} from 'lucide-react';
import type { AnalysisResponse, RetentionMeasure, WaterDeficitLevel } from '../types/api';
import { CROP_NAMES_EN, type Language, type TranslationDict } from '../i18n/translations';
import { ParcelMap } from './ParcelMap';

interface ReportViewProps {
  t: TranslationDict;
  lang: Language;
  report: AnalysisResponse;
  isDemo?: boolean;
  onBack: () => void;
}

const LEVELS: WaterDeficitLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function riskVisual(level: WaterDeficitLevel) {
  switch (level) {
    case 'CRITICAL':
      return { ink: 'var(--risk-critical-ink)', solid: 'var(--risk-critical-solid)', Icon: AlertOctagon };
    case 'HIGH':
      return { ink: 'var(--risk-high-ink)', solid: 'var(--risk-high-solid)', Icon: AlertTriangle };
    case 'MODERATE':
      return { ink: 'var(--risk-moderate-ink)', solid: 'var(--risk-moderate-solid)', Icon: Info };
    default:
      return { ink: 'var(--risk-low-ink)', solid: 'var(--risk-low-solid)', Icon: CheckCircle2 };
  }
}

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

type Priority = 'high' | 'medium' | 'low';

/**
 * The API returns retention measures already ordered by implementation priority (landscape first);
 * the badge combines that order with the drought risk level.
 */
function priorityFor(index: number, level: WaterDeficitLevel): Priority {
  if (level === 'HIGH' || level === 'CRITICAL') return index < 2 ? 'high' : 'medium';
  if (level === 'MODERATE') return index < 2 ? 'medium' : 'low';
  return 'low';
}

const PRIORITY_STYLE: Record<Priority, { badge: React.CSSProperties; accent: string }> = {
  high: { badge: { backgroundImage: 'linear-gradient(90deg, #dc2626, #f97316)', color: '#ffffff' }, accent: '#ea580c' },
  medium: { badge: { backgroundColor: '#d9f99d', color: '#3f6212' }, accent: '#84cc16' },
  low: { badge: { backgroundColor: '#e2e8f0', color: '#334155' }, accent: '#94a3b8' },
};

function measureIcon(m: RetentionMeasure): ComponentType<LucideProps> {
  const s = m.title.toLowerCase();
  if (/zastawk|rów|row |rowie|ditch|sluice/.test(s)) return Waves;
  if (/zadrzew|drzew|bufor|stok|tree|buffer|slope/.test(s)) return Trees;
  if (/międzyplon|miedzyplon|bezork|poplon|cover crop|catch crop/.test(s)) return Sprout;
  if (/mulcz|resztk|okryw|mulch|residue/.test(s)) return Leaf;
  return m.type === 'LANDSCAPE' ? Droplets : Sprout;
}

/* ---------- building blocks ---------- */

function StepSection({
  number,
  t,
  title,
  lead,
  id,
  children,
}: {
  number: number;
  t: TranslationDict;
  title: string;
  lead: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="print-break-avoid border-t pt-6" style={{ borderColor: 'var(--hairline)' }}>
      <header className="mb-4 flex items-start gap-3">
        <span aria-hidden="true" className="step-badge mt-0.5 !h-7 !w-7 !text-sm">
          {number}
        </span>
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            {t.stepWord} {number} / 4
          </p>
          <h2 id={id} className="text-lg font-bold leading-tight tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            {title}
          </h2>
          <p className="mt-0.5 text-[0.8rem] leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
            {lead}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Widget({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-3.5 ${className}`} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--hairline)' }}>
      {children}
    </div>
  );
}

function WidgetLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold leading-tight" style={{ color: 'var(--ink-secondary)' }}>
      <span aria-hidden="true" style={{ color: 'var(--ink-muted)' }}>
        {icon}
      </span>
      {children}
    </p>
  );
}

function NoData({ t }: { t: TranslationDict }) {
  return (
    <span className="mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--ink-muted)' }}>
      {t.unknownValue}
    </span>
  );
}

function IndexScale({
  t,
  label,
  icon,
  value,
  gradient,
  lowWord,
  highWord,
  fmt,
}: {
  t: TranslationDict;
  label: string;
  icon: ReactNode;
  value: number | null;
  gradient: string;
  lowWord: string;
  highWord: string;
  fmt: (v: number, d?: number) => string;
}) {
  const pos = value === null ? null : Math.max(0, Math.min(100, ((value + 1) / 2) * 100));
  return (
    <Widget>
      <div className="flex items-start justify-between gap-2">
        <WidgetLabel icon={icon}>{label}</WidgetLabel>
        {value !== null && (
          <span className="num text-xl font-bold leading-none" style={{ color: 'var(--ink-primary)' }}>
            {value > 0 ? '+' : ''}
            {fmt(value, 2)}
          </span>
        )}
      </div>
      {value === null ? (
        <NoData t={t} />
      ) : (
        <>
          <div className="scale-track mt-3.5" style={{ backgroundImage: gradient }} role="img" aria-label={`${label}: ${fmt(value, 2)} (−1 … 1)`}>
            <span className="scale-marker" style={{ left: `${pos}%` }} />
          </div>
          <div className="num mt-1.5 flex justify-between text-[0.65rem] font-medium" style={{ color: 'var(--ink-muted)' }}>
            <span>−1 · {lowWord}</span>
            <span>0</span>
            <span>
              {highWord} · 1
            </span>
          </div>
        </>
      )}
    </Widget>
  );
}

/* ---------- report ---------- */

export function ReportView({ t, lang, report, isDemo = false, onBack }: ReportViewProps) {
  const [copied, setCopied] = useState(false);

  const { parcelInfo, step1_diagnosis, step2_causesAndRetention, step3_irrigation, step4_sourcesAndLimitations } = report;
  const metrics = step1_diagnosis.metrics;
  const level = step1_diagnosis.riskLevel;
  const risk = riskVisual(level);
  const RiskIcon = risk.Icon;
  const levelIdx = LEVELS.indexOf(level);

  const locale = lang === 'pl' ? 'pl-PL' : 'en-GB';
  const fmt = (value: number, digits = 1) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

  const cropDisplay =
    lang === 'en' ? CROP_NAMES_EN[parcelInfo.cropId] || parcelInfo.cropNamePl : parcelInfo.cropNamePl;

  const rain = metrics.precip90dMm;
  const norm = metrics.precip10yrAvg90dMm;
  const pctOfNorm = !isMissing(rain) && !isMissing(norm) && norm > 0 ? Math.round((rain / norm) * 100) : null;
  const rainScaleMax = Math.max(rain ?? 0, norm ?? 0, 1) * 1.08;
  const rainColor =
    pctOfNorm === null ? 'var(--water-accent)' : pctOfNorm >= 90 ? '#2e7d32' : pctOfNorm >= 60 ? '#ea8a00' : '#d32f2f';
  const droughtSeasons = isMissing(metrics.historicalDroughtYears)
    ? null
    : Math.max(0, Math.min(10, metrics.historicalDroughtYears));

  const measures = step2_causesAndRetention.retentionRecommendationsPl;

  async function handleCopyLink() {
    const shareUrl = isDemo ? window.location.href : `${window.location.origin}/report/${report.reportUuid}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t.copyLink, shareUrl);
    }
  }

  const satelliteWarning =
    step4_sourcesAndLimitations.satelliteStatus === 'NO_DATA'
      ? t.satelliteWarningNoData
      : step4_sourcesAndLimitations.satelliteStatus === 'CLOUDY_FALLBACK'
        ? t.satelliteWarningCloudy
        : step4_sourcesAndLimitations.satelliteStatus === 'ERROR'
          ? t.satelliteWarningError
          : null;

  const terrainTiles: { key: string; icon: ReactNode; label: string; value: string | null; unit?: string; hint?: string; warn?: boolean }[] = [
    {
      key: 'sand',
      icon: <Leaf className="h-3.5 w-3.5" />,
      label: t.techSand,
      value: isMissing(metrics.sandPct) ? null : fmt(metrics.sandPct, 0),
      unit: '%',
      hint: isMissing(metrics.sandPct) ? undefined : metrics.sandPct > 65 ? t.techSandHigh : t.techSandMedium,
      warn: !isMissing(metrics.sandPct) && metrics.sandPct > 65,
    },
    {
      key: 'slope',
      icon: <Mountain className="h-3.5 w-3.5" />,
      label: t.techSlope,
      value: isMissing(metrics.slopeDeg) ? null : fmt(metrics.slopeDeg, 1),
      unit: '°',
      hint: isMissing(metrics.slopeDeg) ? undefined : metrics.slopeDeg > 3 ? t.techSlopeSteep : t.techSlopeFlat,
      warn: !isMissing(metrics.slopeDeg) && metrics.slopeDeg > 3,
    },
    {
      key: 'water',
      icon: <Waves className="h-3.5 w-3.5" />,
      label: t.techWaterDist,
      value: isMissing(metrics.nearestWaterDistM) ? null : String(Math.round(metrics.nearestWaterDistM)),
      unit: 'm',
    },
  ];

  const copyButton = (className: string, compact = false) => (
    <button
      type="button"
      onClick={handleCopyLink}
      className={className}
      aria-pressed={copied}
      aria-label={compact ? (copied ? t.linkCopied : t.copyLinkShort) : undefined}
      title={compact ? t.copyLinkShort : undefined}
    >
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" style={{ color: 'var(--emerald)' }} />
      ) : (
        <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      )}
      <span className={compact ? 'hidden sm:inline' : undefined}>{copied ? t.linkCopied : t.copyLinkShort}</span>
    </button>
  );

  const pdfButton = (className: string, compact = false) => (
    <button
      type="button"
      onClick={() => window.print()}
      className={className}
      aria-label={compact ? t.downloadPdf : undefined}
      title={compact ? t.downloadPdf : undefined}
    >
      <FileDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      <span className={compact ? 'hidden sm:inline' : undefined}>{t.downloadPdf}</span>
    </button>
  );

  return (
    <div className="relative lg:h-[calc(100vh-65px)] lg:overflow-hidden print:h-auto print:overflow-visible">
      {/* Map canvas with the highlighted parcel */}
      <section aria-label={t.layerMap} className="no-print relative h-[48svh] max-h-[480px] min-h-[300px] sm:h-[460px] sm:max-h-none lg:absolute lg:inset-0 lg:h-full">
        <ParcelMap
          t={t}
          interactive={false}
          polygon={parcelInfo.polygonGeoJson}
          parcelLabel={{
            title: parcelInfo.dzialkaId,
            subtitle: isMissing(parcelInfo.areaHa) ? undefined : `~${fmt(parcelInfo.areaHa, 2)} ha`,
          }}
          slopeDeg={metrics.slopeDeg}
          defaultBaseLayer="orto"
          droughtDate={parcelInfo.targetDate}
          defaultShowParcels
          showViewportWater
          overlayOffsetClass="lg:left-[556px] xl:left-[616px]"
          reserveTopRight
          className="h-full"
        />

        {/* Floating actions */}
        <div className="absolute right-3 top-3 z-[500] flex flex-wrap justify-end gap-2 sm:right-4 sm:top-4">
          {pdfButton('float-btn !min-h-[40px] !px-3 sm:!min-h-[44px] sm:!px-[1.1rem]', true)}
          {copyButton('float-btn !min-h-[40px] !px-3 sm:!min-h-[44px] sm:!px-[1.1rem]', true)}
        </div>
      </section>

      {/* Floating report sheet */}
      <aside className="relative z-10 px-3 py-4 sm:px-6 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:left-0 lg:p-5 print:static print:p-0">
        <article className="glass-sheet panel-scroll flex flex-col gap-6 p-5 sm:p-6 lg:pointer-events-auto lg:h-full lg:w-[520px] lg:overflow-y-auto xl:w-[580px] print:h-auto print:w-full print:overflow-visible print:p-0">
          {/* Top bar */}
          <div className="no-print flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBack}
              className="btn-ghost -ml-2 inline-flex min-h-[38px] items-center gap-2 rounded-xl px-2.5 text-sm font-semibold"
              style={{ color: 'var(--ink-primary)' }}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              <span>{t.backToSearch}</span>
            </button>
            {isDemo && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'var(--water-soft)', color: 'var(--water-accent)' }}
                title={t.demoBannerBody}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                {t.demoBannerTitle}
              </span>
            )}
          </div>

          {/* Print-only header */}
          <div className="print-only hidden pb-3" style={{ borderBottom: '1px solid #999' }}>
            <p className="text-lg font-bold">WodoPlon — Raport sytuacji wodnej działki rolnej</p>
            <p className="text-xs">
              Działka {parcelInfo.dzialkaId}, {cropDisplay}, powierzchnia {fmt(parcelInfo.areaHa, 2)} ha, data analizy: {parcelInfo.targetDate}
            </p>
          </div>

          {/* Parcel identity */}
          <section>
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              {t.parcelLabel}
            </p>
            <h1 className="num break-all text-xl font-bold leading-tight sm:text-2xl" style={{ color: 'var(--ink-primary)' }}>
              {parcelInfo.dzialkaId}
            </h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="tag" style={{ backgroundColor: 'var(--emerald-soft)', border: '1px solid var(--emerald-border)' }}>
                <Wheat className="h-3.5 w-3.5" style={{ color: 'var(--emerald)' }} aria-hidden="true" />
                {cropDisplay}
              </span>
              <span className="tag num" title={t.areaLabel}>
                {isMissing(parcelInfo.areaHa) ? t.unknownValue : `${fmt(parcelInfo.areaHa, 2)} ha`}
              </span>
              <span className="tag" title={t.voivodeshipLabel}>
                {parcelInfo.voivodeship ?? t.unknownValue}
              </span>
              <span className="tag num" title={t.dateLabel}>
                <CalendarDays className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
                {parcelInfo.targetDate}
              </span>
            </div>
          </section>

          {/* STEP 1 — water status */}
          <StepSection number={1} t={t} id="step-1" title={t.step1Title} lead={t.step1Lead}>
            <div className="risk-hero p-4 sm:p-5" style={{ backgroundColor: risk.solid }}>
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider opacity-85">{t.deficitLevelLabel}</p>
              <p className="mt-1 flex items-center gap-2.5 text-xl font-extrabold uppercase leading-tight tracking-wide sm:text-2xl">
                <RiskIcon className="h-7 w-7 shrink-0" strokeWidth={2.25} aria-hidden="true" />
                {t.riskLabels[level]}
              </p>
              <div className="mt-4 flex gap-1.5" aria-hidden="true">
                {LEVELS.map((l, i) => (
                  <span key={l} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i <= levelIdx ? '#ffffff' : 'rgba(255,255,255,0.3)' }} />
                ))}
              </div>
            </div>

            <p className="mt-4 text-[0.95rem] leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
              {step1_diagnosis.summaryPl}
            </p>
            {step1_diagnosis.historicalContextPl && (
              <p className="mt-2.5 flex items-start gap-2 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                <History className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
                {step1_diagnosis.historicalContextPl}
              </p>
            )}

            {/* Rainfall vs 10-year normal */}
            <Widget className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <WidgetLabel icon={<CloudRain className="h-3.5 w-3.5" />}>{t.metricPrecip}</WidgetLabel>
                {pctOfNorm !== null && (
                  <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={{ color: '#fff', backgroundColor: rainColor }}>
                    <span className="num">{pctOfNorm}%</span> {t.ofNorm}
                  </span>
                )}
              </div>
              {isMissing(rain) ? (
                <NoData t={t} />
              ) : (
                <>
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                    {t.precip90Label}:{' '}
                    <strong className="num text-base" style={{ color: 'var(--ink-primary)' }}>
                      {fmt(rain, 1)} mm
                    </strong>
                    {!isMissing(norm) && (
                      <span className="num">
                        {' '}
                        ({t.normLabel} {fmt(norm, 1)} mm)
                      </span>
                    )}
                  </p>
                  <div
                    className="relative mt-2.5 h-3 w-full overflow-visible rounded-full"
                    style={{ backgroundColor: 'var(--bg-hover)' }}
                    role="img"
                    aria-label={`${fmt(rain, 1)} mm / ${isMissing(norm) ? '—' : fmt(norm, 1)} mm`}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${(rain / rainScaleMax) * 100}%`, backgroundColor: rainColor }}
                    />
                    {!isMissing(norm) && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 h-5 w-[3px] rounded-full"
                        style={{ left: `calc(${(norm / rainScaleMax) * 100}% - 1.5px)`, backgroundColor: 'var(--ink-primary)' }}
                        title={`${t.normLabel}`}
                      />
                    )}
                  </div>
                </>
              )}
            </Widget>

            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Widget>
                <WidgetLabel icon={<Droplets className="h-3.5 w-3.5" />}>{t.metricBalance}</WidgetLabel>
                {isMissing(metrics.waterBalanceMm) ? (
                  <NoData t={t} />
                ) : (
                  <>
                    <p
                      className="num mt-1.5 text-xl font-bold"
                      style={{ color: metrics.waterBalanceMm < 0 ? 'var(--risk-high-ink)' : 'var(--brand-primary)' }}
                    >
                      {metrics.waterBalanceMm > 0 ? '+' : metrics.waterBalanceMm < 0 ? '−' : ''}
                      {fmt(Math.abs(metrics.waterBalanceMm), 1)}
                      <span className="ml-1 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                        mm
                      </span>
                    </p>
                    <p className="text-[0.7rem]" style={{ color: 'var(--ink-secondary)' }}>
                      {metrics.waterBalanceMm < 0 ? t.metricBalanceDeficit : t.metricBalanceSurplus}
                    </p>
                  </>
                )}
              </Widget>

              <Widget>
                <WidgetLabel icon={<Sun className="h-3.5 w-3.5" />}>{t.metricDrySpell}</WidgetLabel>
                {isMissing(metrics.drySpellDays) ? (
                  <NoData t={t} />
                ) : (
                  <p className="num mt-1.5 text-xl font-bold" style={{ color: metrics.drySpellDays >= 14 ? 'var(--risk-moderate-ink)' : 'var(--ink-primary)' }}>
                    {metrics.drySpellDays}
                    <span className="ml-1 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                      {t.metricDays}
                    </span>
                  </p>
                )}
              </Widget>

              <Widget>
                <WidgetLabel icon={<History className="h-3.5 w-3.5" />}>{t.metricHistory}</WidgetLabel>
                {droughtSeasons === null ? (
                  <NoData t={t} />
                ) : (
                  <>
                    <p className="num mt-1.5 text-xl font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {droughtSeasons}
                      <span className="ml-1 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                        / 10
                      </span>
                    </p>
                    <div className="mt-1.5 flex gap-[3px]" role="img" aria-label={`${droughtSeasons} / 10`}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <span key={i} className="h-1.5 flex-1 rounded-sm" style={{ backgroundColor: i < droughtSeasons ? risk.solid : 'var(--bg-hover)' }} />
                      ))}
                    </div>
                  </>
                )}
              </Widget>
            </div>

            <h3 className="mt-5 text-[0.7rem] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              {t.satelliteHeading}
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <IndexScale
                t={t}
                label="NDVI"
                icon={<Satellite className="h-3.5 w-3.5" />}
                value={isMissing(metrics.ndviMean) ? null : metrics.ndviMean}
                gradient="linear-gradient(90deg, #8d6e63 0%, #d6b25e 38%, #c5d86d 55%, #4caf50 75%, #1b5e20 100%)"
                lowWord={t.ndviScaleLow}
                highWord={t.ndviScaleHigh}
                fmt={fmt}
              />
              <IndexScale
                t={t}
                label="NDWI"
                icon={<Droplets className="h-3.5 w-3.5" />}
                value={isMissing(metrics.ndwiMean) ? null : metrics.ndwiMean}
                gradient="linear-gradient(90deg, #c2410c 0%, #f59e0b 30%, #f1f5f9 50%, #60a5fa 70%, #1d4ed8 100%)"
                lowWord={t.ndwiScaleLow}
                highWord={t.ndwiScaleHigh}
                fmt={fmt}
              />
            </div>

            <h3 className="mt-5 text-[0.7rem] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              {t.terrainHeading}
            </h3>
            <dl className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {terrainTiles.map((tile) => (
                <Widget key={tile.key}>
                  <dt>
                    <WidgetLabel icon={tile.icon}>{tile.label}</WidgetLabel>
                  </dt>
                  <dd>
                    {tile.value === null ? (
                      <NoData t={t} />
                    ) : (
                      <>
                        <p className="num mt-1.5 text-xl font-bold" style={{ color: tile.warn ? 'var(--risk-moderate-ink)' : 'var(--ink-primary)' }}>
                          {tile.value}
                          <span className="ml-0.5 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                            {tile.unit}
                          </span>
                        </p>
                        {tile.hint && (
                          <p className="text-[0.7rem] leading-snug" style={{ color: 'var(--ink-secondary)' }}>
                            {tile.hint}
                          </p>
                        )}
                      </>
                    )}
                  </dd>
                </Widget>
              ))}
            </dl>
          </StepSection>

          {/* STEP 2 — causes and retention (always before irrigation) */}
          <StepSection number={2} t={t} id="step-2" title={t.step2Title} lead={t.step2Lead}>
            <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              <Search className="h-4 w-4" style={{ color: 'var(--risk-high-ink)' }} aria-hidden="true" />
              {t.causesHeading}
            </h3>
            <ul className="mt-2.5 flex flex-col gap-2">
              {step2_causesAndRetention.causesPl.map((cause) => (
                <li
                  key={cause}
                  className="print-break-avoid rounded-lg px-3.5 py-2.5 text-sm leading-relaxed"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--hairline)', borderLeft: '4px solid var(--risk-high-solid)', color: 'var(--ink-primary)' }}
                >
                  {cause}
                </li>
              ))}
            </ul>

            <h3 className="mt-6 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              <Droplets className="h-4 w-4" style={{ color: 'var(--water-accent)' }} aria-hidden="true" />
              {t.retentionHeading}
            </h3>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {t.retentionPriorityNote}
            </p>

            {measures.length === 0 ? (
              <p className="mt-3 rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--ink-muted)' }}>
                {t.noMeasures}
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-2.5">
                {measures.map((m, idx) => {
                  const priority = priorityFor(idx, level);
                  const ps = PRIORITY_STYLE[priority];
                  const Icon = measureIcon(m);
                  const landscape = m.type === 'LANDSCAPE';
                  return (
                    <li
                      key={`${m.title}-${idx}`}
                      className="print-break-avoid rise-in relative overflow-hidden rounded-xl p-4"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-card)', animationDelay: `${idx * 60}ms` }}
                    >
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: ps.accent }} />
                      <div className="flex items-start gap-3.5">
                        <span
                          aria-hidden="true"
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: landscape ? 'var(--water-soft)' : 'var(--brand-soft)',
                            color: landscape ? 'var(--water-accent)' : 'var(--brand-primary)',
                          }}
                        >
                          <Icon className="h-6 w-6" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="priority-badge" style={ps.badge}>
                              {priority === 'high' ? t.priorityHigh : priority === 'medium' ? t.priorityMedium : t.priorityLow}
                            </span>
                            <span className="text-[0.68rem] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                              {landscape ? t.retentionTypeLandscape : t.retentionTypeSoil}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[0.95rem] font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
                            {m.title}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                            {m.description}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mt-2.5 text-[0.7rem]" style={{ color: 'var(--ink-muted)' }}>
              {t.priorityNote}
            </p>
          </StepSection>

          {/* STEP 3 — irrigation, strictly after retention */}
          <StepSection number={3} t={t} id="step-3" title={t.step3Title} lead={t.step3Lead}>
            <p className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed" style={{ backgroundColor: 'var(--water-soft)', color: 'var(--ink-primary)' }}>
              <Info className="mt-px h-4 w-4 shrink-0" style={{ color: 'var(--water-accent)' }} aria-hidden="true" />
              {t.irrigationAfterRetention}
            </p>

            <div
              className="mt-3 rounded-xl p-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: `1.5px solid ${step3_irrigation.isRecommended ? 'var(--water-accent)' : 'var(--hairline)'}`,
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: step3_irrigation.isRecommended ? 'var(--water-accent)' : 'var(--brand-soft)',
                    color: step3_irrigation.isRecommended ? 'var(--water-on)' : 'var(--brand-primary)',
                  }}
                >
                  {step3_irrigation.isRecommended ? <Droplets className="h-5 w-5" strokeWidth={2} /> : <ShieldCheck className="h-5 w-5" strokeWidth={2} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
                    {step3_irrigation.isRecommended ? t.irrigationYes : t.irrigationNo}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                    {step3_irrigation.advicePl}
                  </p>
                </div>
              </div>

              {step3_irrigation.isRecommended && (
                <div className="mt-3.5 flex items-end justify-between gap-3 rounded-lg px-3.5 py-3" style={{ backgroundColor: 'var(--water-soft)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                    {t.irrigationDoseLabel}
                  </p>
                  {isMissing(step3_irrigation.doseMm) ? (
                    <NoData t={t} />
                  ) : (
                    <p className="num text-right text-2xl font-bold leading-none" style={{ color: 'var(--water-accent)' }}>
                      {Math.round(step3_irrigation.doseMm)}
                      <span className="ml-1 text-sm font-medium">mm</span>
                      <span className="mt-1 block text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
                        {Math.round(step3_irrigation.doseMm * 10)} m³/ha
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </StepSection>

          {/* STEP 4 — sources, dates and limitations */}
          <StepSection number={4} t={t} id="step-4" title={t.step4Title} lead={t.step4Lead}>
            {satelliteWarning && (
              <div role="note" className="mb-3 flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm" style={{ backgroundColor: 'var(--risk-moderate-soft)' }}>
                <CloudOff className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--risk-moderate-ink)' }} strokeWidth={1.9} aria-hidden="true" />
                <p className="font-medium leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
                  {satelliteWarning}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <Widget>
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {t.sourcesHeading}
                </h3>
                {step4_sourcesAndLimitations.sources.length === 0 ? (
                  <NoData t={t} />
                ) : (
                  <ul className="mt-2.5 space-y-1.5">
                    {step4_sourcesAndLimitations.sources.map((src) => (
                      <li key={src} className="flex items-start gap-2 text-[0.8rem] leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                        <Database className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
                        {src}
                      </li>
                    ))}
                  </ul>
                )}
              </Widget>

              <div className="rounded-xl p-3.5" style={{ backgroundColor: 'var(--risk-moderate-soft)' }}>
                <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                  <TriangleAlert className="h-4 w-4" style={{ color: 'var(--risk-moderate-ink)' }} aria-hidden="true" />
                  {t.limitationsHeading}
                </h3>
                {step4_sourcesAndLimitations.limitationsPl.length === 0 ? (
                  <NoData t={t} />
                ) : (
                  <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-[0.8rem] leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
                    {step4_sourcesAndLimitations.limitationsPl.map((lim) => (
                      <li key={lim}>{lim}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </StepSection>

          {/* Bottom actions (also reachable on small screens without scrolling back to the map) */}
          <div className="no-print flex flex-col gap-2.5 border-t pt-5" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex flex-wrap gap-2">
              {pdfButton('btn-cta inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold')}
              {copyButton('float-btn flex-1 justify-center !shadow-none')}
            </div>
            <p className="text-[0.7rem]" style={{ color: 'var(--ink-muted)' }}>
              {lang === 'pl'
                ? 'W oknie drukowania wybierz „Zapisz jako PDF”, aby zachować raport.'
                : 'In the print dialog choose “Save as PDF” to keep the report.'}
            </p>
          </div>
        </article>
      </aside>
    </div>
  );
}
