import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Droplets,
  Info,
  Link2,
  Printer,
  ShieldCheck,
  Sprout,
  Waves,
} from 'lucide-react';
import type { AnalysisResponse, WaterDeficitLevel } from '../types/api';
import { CROP_NAMES_EN, type Language, type TranslationDict } from '../i18n/translations';
import { ParcelMap } from './ParcelMap';

interface ReportViewProps {
  t: TranslationDict;
  lang: Language;
  report: AnalysisResponse;
  isDemo?: boolean;
  onBack: () => void;
}

function riskVisual(level: WaterDeficitLevel) {
  switch (level) {
    case 'CRITICAL':
      return { ink: 'var(--risk-critical-ink)', Icon: AlertOctagon };
    case 'HIGH':
      return { ink: 'var(--risk-high-ink)', Icon: AlertTriangle };
    case 'MODERATE':
      return { ink: 'var(--risk-moderate-ink)', Icon: Info };
    default:
      return { ink: 'var(--risk-low-ink)', Icon: CheckCircle2 };
  }
}

function formatNum(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function ReportView({ t, lang, report, isDemo = false, onBack }: ReportViewProps) {
  const [copied, setCopied] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const {
    parcelInfo,
    step1_diagnosis,
    step2_causesAndRetention,
    step3_irrigation,
    step4_sourcesAndLimitations,
  } = report;
  const metrics = step1_diagnosis.metrics;
  const risk = riskVisual(step1_diagnosis.riskLevel);
  const RiskIcon = risk.Icon;

  const cropDisplay =
    lang === 'en' ? CROP_NAMES_EN[parcelInfo.cropId] || parcelInfo.cropNamePl : parcelInfo.cropNamePl;

  const rainMax = Math.max(metrics.precip90dMm, metrics.precip10yrAvg90dMm ?? 0, 1);
  const rainActualPct = Math.min(100, Math.round((metrics.precip90dMm / rainMax) * 100));
  const rainNormPct =
    metrics.precip10yrAvg90dMm !== null
      ? Math.min(100, Math.round((metrics.precip10yrAvg90dMm / rainMax) * 100))
      : null;

  const droughtSeasons = Math.max(0, Math.min(10, metrics.historicalDroughtYears));

  async function handleCopyLink() {
    const shareUrl = isDemo
      ? window.location.href
      : `${window.location.origin}/report/${report.reportUuid}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t.copyLink, shareUrl);
    }
  }

  function handlePrint() {
    window.print();
  }

  const satelliteWarning =
    step4_sourcesAndLimitations.satelliteStatus === 'NO_DATA'
      ? t.satelliteWarningNoData
      : step4_sourcesAndLimitations.satelliteStatus === 'CLOUDY_FALLBACK'
        ? t.satelliteWarningCloudy
        : step4_sourcesAndLimitations.satelliteStatus === 'ERROR'
          ? t.satelliteWarningError
          : null;

  return (
    <div style={{ backgroundColor: 'var(--bg-canvas)' }}>
      {/* Clean neutral demo notice bar — no pastel yellow fill */}
      {isDemo && (
        <div
          role="note"
          className="no-print"
          style={{
            backgroundColor: 'var(--bg-field)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div className="mx-auto flex max-w-[1120px] items-center gap-2.5 px-4 py-2 text-sm sm:px-6">
            <Info
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--ink-secondary)' }}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p style={{ color: 'var(--ink-secondary)' }}>
              <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>
                {t.demoBannerTitle}.
              </span>{' '}
              {t.demoBannerBody}
            </p>
          </div>
        </div>
      )}

      <article className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 sm:py-10">
        {/* Action bar */}
        <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-ghost inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold"
            style={{ color: 'var(--ink-primary)' }}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
            <span>{t.backToSearch}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {!isDemo && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn-ghost inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold"
                style={{ color: copied ? 'var(--brand-primary)' : 'var(--ink-primary)' }}
              >
                {copied ? (
                  <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Link2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>{copied ? t.linkCopied : t.copyLink}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="btn-primary inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 text-sm font-semibold"
            >
              <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>{t.printPdf}</span>
            </button>
          </div>
        </div>

        {/* Print-only header */}
        <div className="print-only mb-4 hidden pb-3" style={{ borderBottom: '1px solid #999' }}>
          <p className="text-lg font-bold">WodoPlon — Raport sytuacji wodnej działki rolnej</p>
          <p className="text-xs">
            Działka {parcelInfo.dzialkaId} · {cropDisplay} · Data analizy: {parcelInfo.targetDate}
          </p>
        </div>

        {/* TOP SECTION: Parcel Identity + Stage 1 Verdict + Integrated Map */}
        <section aria-labelledby="stage-1-heading">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
            <div className="min-w-0">
              {/* Parcel identity */}
              <div className="pb-6" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <h1
                  className="break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {t.parcelLabel}{' '}
                  <span className="tabular-nums">{parcelInfo.dzialkaId}</span>
                </h1>

                <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-sm">
                  <div>
                    <dt className="inline" style={{ color: 'var(--ink-muted)' }}>
                      {t.cropLabel}:{' '}
                    </dt>
                    <dd className="inline font-semibold" style={{ color: 'var(--ink-primary)' }}>
                      {cropDisplay}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline" style={{ color: 'var(--ink-muted)' }}>
                      {t.areaLabel}:{' '}
                    </dt>
                    <dd className="tabular-nums inline font-semibold" style={{ color: 'var(--ink-primary)' }}>
                      {formatNum(parcelInfo.areaHa, 2)} ha
                    </dd>
                  </div>
                  {parcelInfo.voivodeship && (
                    <div>
                      <dt className="inline" style={{ color: 'var(--ink-muted)' }}>
                        {t.voivodeshipLabel}:{' '}
                      </dt>
                      <dd className="inline font-semibold capitalize" style={{ color: 'var(--ink-primary)' }}>
                        {parcelInfo.voivodeship}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline" style={{ color: 'var(--ink-muted)' }}>
                      {t.dateLabel}:{' '}
                    </dt>
                    <dd className="tabular-nums inline font-semibold" style={{ color: 'var(--ink-primary)' }}>
                      {parcelInfo.targetDate}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* STAGE 1 VERDICT — bare icon, zero pastel circle, crisp type */}
              <div className="pt-6">
                <h2
                  id="stage-1-heading"
                  className="text-xl font-bold tracking-tight"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {t.stage1Title}
                </h2>

                <div className="mt-3 flex items-center gap-2.5">
                  <RiskIcon
                    className="h-5 w-5 shrink-0"
                    style={{ color: risk.ink }}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <p
                    className="text-lg font-bold leading-tight"
                    style={{ color: risk.ink }}
                  >
                    {t.riskLabels[step1_diagnosis.riskLevel]}
                  </p>
                </div>

                <p
                  className="mt-3 max-w-[62ch] text-base leading-relaxed"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {step1_diagnosis.summaryPl}
                </p>
                <p
                  className="mt-2 max-w-[62ch] text-sm leading-relaxed"
                  style={{ color: 'var(--ink-secondary)' }}
                >
                  {step1_diagnosis.historicalContextPl}
                </p>
              </div>
            </div>

            {/* Clean map frame */}
            <div
              className="no-print h-[280px] overflow-hidden rounded-xl lg:h-full lg:min-h-[300px]"
              style={{ border: '1px solid var(--hairline)' }}
            >
              <ParcelMap
                t={t}
                interactive={false}
                polygon={parcelInfo.polygonGeoJson}
                riskLevel={step1_diagnosis.riskLevel}
                className="h-full"
              />
            </div>
          </div>

          {/* DATA VISUALIZATION STRIP — pure white, hairline-divided, clean monochrome + single signal */}
          <div
            className="print-break-avoid mt-9 grid grid-cols-1 gap-8 py-7 md:grid-cols-3 md:gap-0 md:divide-x"
            style={{
              borderTop: '1px solid var(--hairline)',
              borderBottom: '1px solid var(--hairline)',
              borderColor: 'var(--hairline)',
            }}
          >
            {/* Viz 1: Water Balance + Dry Spell */}
            <div className="md:pr-8" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink-secondary)' }}>
                {t.metricBalance}
              </p>
              <p
                className="tabular-nums mt-1.5 text-3xl font-bold tracking-tight"
                style={{
                  color: metrics.waterBalanceMm < -40 ? risk.ink : 'var(--ink-primary)',
                }}
              >
                {metrics.waterBalanceMm > 0 ? '+' : ''}
                {formatNum(metrics.waterBalanceMm, 1)}{' '}
                <span className="text-base font-medium" style={{ color: 'var(--ink-muted)' }}>
                  mm
                </span>
              </p>
              <p className="mt-1.5 text-sm" style={{ color: 'var(--ink-secondary)' }}>
                {metrics.waterBalanceMm < 0 ? t.metricBalanceDeficit : t.metricBalanceSurplus} ·{' '}
                <span className="tabular-nums font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {metrics.drySpellDays} {t.metricDays}
                </span>{' '}
                {t.metricDrySpell.toLowerCase()}
              </p>
            </div>

            {/* Viz 2: Rainfall vs 10-year Normal */}
            <div className="md:px-8" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink-secondary)' }}>
                {t.metricPrecip}
              </p>
              <div className="mt-3 space-y-2.5">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="tabular-nums font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {formatNum(metrics.precip90dMm, 1)} mm
                    </span>
                    <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                      90 {t.metricDays}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-2 w-full overflow-hidden rounded-sm"
                    style={{ backgroundColor: 'var(--bg-field)' }}
                  >
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${rainActualPct}%`,
                        backgroundColor: 'var(--ink-primary)',
                      }}
                    />
                  </div>
                </div>

                {rainNormPct !== null && metrics.precip10yrAvg90dMm !== null && (
                  <div>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="tabular-nums font-medium" style={{ color: 'var(--ink-secondary)' }}>
                        {formatNum(metrics.precip10yrAvg90dMm, 1)} mm
                      </span>
                      <span style={{ color: 'var(--ink-muted)' }}>{t.metricPrecipNorm}</span>
                    </div>
                    <div
                      className="mt-1 h-2 w-full overflow-hidden rounded-sm"
                      style={{ backgroundColor: 'var(--bg-field)' }}
                    >
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${rainNormPct}%`,
                          backgroundColor: '#b3b3b3',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Viz 3: 10-Year Historical Drought Frequency */}
            <div className="md:pl-8" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--ink-secondary)' }}>
                {t.metricHistory}
              </p>
              <p className="tabular-nums mt-1.5 text-3xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
                {droughtSeasons}{' '}
                <span className="text-base font-medium" style={{ color: 'var(--ink-muted)' }}>
                  {t.metricSeasons}
                </span>
              </p>
              <div
                className="mt-3 flex items-center gap-1"
                aria-label={`${droughtSeasons} / 10`}
                role="img"
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <span
                    key={i}
                    className="h-2 flex-1 rounded-xs"
                    style={{
                      backgroundColor: i < droughtSeasons ? risk.ink : '#e5e5e5',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Progressive disclosure: technical soil, terrain & satellite measurements */}
          <div className="py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <button
              type="button"
              onClick={() => setShowTech((v) => !v)}
              aria-expanded={showTech}
              className="no-print inline-flex min-h-[36px] items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
              style={{ color: 'var(--ink-secondary)' }}
            >
              {showTech ? (
                <ChevronUp className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
              )}
              <span>{showTech ? t.hideTechDetails : t.showTechDetails}</span>
            </button>

            {showTech && (
              <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 pb-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <dt style={{ color: 'var(--ink-muted)' }}>{t.techSand}</dt>
                  <dd className="tabular-nums mt-1 font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {metrics.sandPct !== null ? `${formatNum(metrics.sandPct, 0)}%` : t.unknownValue}
                  </dd>
                  {metrics.sandPct !== null && (
                    <>
                      <div
                        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm"
                        style={{ backgroundColor: 'var(--bg-field)' }}
                      >
                        <div
                          className="h-full rounded-sm"
                          style={{
                            width: `${Math.min(100, Math.max(0, metrics.sandPct))}%`,
                            backgroundColor: 'var(--ink-primary)',
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                        {metrics.sandPct > 65 ? t.techSandHigh : t.techSandMedium}
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <dt style={{ color: 'var(--ink-muted)' }}>{t.techSlope}</dt>
                  <dd className="tabular-nums mt-1 font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {metrics.slopeDeg !== null ? `${formatNum(metrics.slopeDeg, 1)}°` : t.unknownValue}
                  </dd>
                  {metrics.slopeDeg !== null && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                      {metrics.slopeDeg > 3 ? t.techSlopeSteep : t.techSlopeFlat}
                    </p>
                  )}
                </div>

                <div>
                  <dt style={{ color: 'var(--ink-muted)' }}>{t.techWaterDist}</dt>
                  <dd className="tabular-nums mt-1 font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {metrics.nearestWaterDistM !== null
                      ? `${Math.round(metrics.nearestWaterDistM)} m`
                      : t.unknownValue}
                  </dd>
                </div>

                <div>
                  <dt style={{ color: 'var(--ink-muted)' }}>{t.techNdvi}</dt>
                  <dd className="tabular-nums mt-1 font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {metrics.ndviMean !== null ? formatNum(metrics.ndviMean, 2) : t.unknownValue}
                  </dd>
                </div>

                <div>
                  <dt style={{ color: 'var(--ink-muted)' }}>{t.techNdwi}</dt>
                  <dd className="tabular-nums mt-1 font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {metrics.ndwiMean !== null ? formatNum(metrics.ndwiMean, 2) : t.unknownValue}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </section>

        {/* STAGE 2: CAUSES & RETENTION MEASURES — bare monochrome icons, pure white editorial flow */}
        <section
          aria-labelledby="stage-2-heading"
          className="print-break-avoid py-10"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <div className="max-w-[70ch]">
            <h2
              id="stage-2-heading"
              className="text-xl font-bold tracking-tight"
              style={{ color: 'var(--ink-primary)' }}
            >
              {t.stage2Title}
            </h2>
            <p className="mt-1.5 text-base leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              {t.retentionPriorityNote}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Causes */}
            <div className="lg:col-span-5">
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink-muted)' }}>
                {t.causesHeading}
              </h3>
              <ul className="mt-4 space-y-3.5 text-base">
                {step2_causesAndRetention.causesPl.map((cause) => (
                  <li key={cause} className="flex items-start gap-3 leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--ink-primary)' }}
                    />
                    <span style={{ color: 'var(--ink-primary)' }}>{cause}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Retention actions — bare 18px neutral icons, ZERO pastel circle backgrounds */}
            <div className="lg:col-span-7">
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink-muted)' }}>
                {t.retentionHeading}
              </h3>
              <div className="mt-4 divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {step2_causesAndRetention.retentionRecommendationsPl.map((item, idx) => {
                  const isLandscape = item.type === 'LANDSCAPE';
                  return (
                    <div
                      key={item.title}
                      className={`flex items-start gap-3.5 ${idx === 0 ? 'pb-5' : 'py-5'} last:pb-0`}
                      style={{ borderColor: 'var(--hairline)' }}
                    >
                      <span className="mt-0.5 shrink-0" style={{ color: 'var(--ink-secondary)' }} aria-hidden="true">
                        {isLandscape ? (
                          <Waves className="h-5 w-5" strokeWidth={1.75} />
                        ) : (
                          <Sprout className="h-5 w-5" strokeWidth={1.75} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                          {isLandscape ? t.retentionTypeLandscape : t.retentionTypeSoil}
                        </p>
                        <p className="mt-0.5 text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {item.title}
                        </p>
                        <p
                          className="mt-1 max-w-[62ch] text-sm leading-relaxed sm:text-base"
                          style={{ color: 'var(--ink-secondary)' }}
                        >
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* STAGE 3: IRRIGATION — bare icon, zero background tile */}
        <section
          aria-labelledby="stage-3-heading"
          className="print-break-avoid py-10"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <h2 id="stage-3-heading" className="text-xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            {t.stage3Title}
          </h2>

          <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div className="flex items-start gap-3.5">
              <span
                className="mt-1 shrink-0"
                style={{
                  color: step3_irrigation.isRecommended
                    ? 'var(--ink-primary)'
                    : 'var(--brand-primary)',
                }}
                aria-hidden="true"
              >
                {step3_irrigation.isRecommended ? (
                  <Droplets className="h-5 w-5" strokeWidth={1.9} />
                ) : (
                  <ShieldCheck className="h-5 w-5" strokeWidth={1.9} />
                )}
              </span>

              <div className="min-w-0">
                <p className="text-xl font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>
                  {step3_irrigation.isRecommended ? t.irrigationYes : t.irrigationNo}
                </p>
                <p
                  className="mt-2 max-w-[65ch] text-base leading-relaxed"
                  style={{ color: 'var(--ink-secondary)' }}
                >
                  {step3_irrigation.advicePl}
                </p>
              </div>
            </div>

            {step3_irrigation.isRecommended && step3_irrigation.doseMm !== null && (
              <div
                className="shrink-0 pl-0 md:pl-8"
                style={{ borderLeft: '1px solid var(--hairline)' }}
              >
                <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                  {t.irrigationDoseLabel}
                </p>
                <p
                  className="tabular-nums mt-1 text-3xl font-bold tracking-tight"
                  style={{ color: 'var(--ink-primary)' }}
                >
                  {Math.round(step3_irrigation.doseMm)}{' '}
                  <span className="text-base font-medium" style={{ color: 'var(--ink-muted)' }}>
                    mm
                  </span>
                </p>
                <p className="tabular-nums text-sm" style={{ color: 'var(--ink-secondary)' }}>
                  {Math.round(step3_irrigation.doseMm * 10)} m³/ha
                </p>
              </div>
            )}
          </div>
        </section>

        {/* STAGE 4: SOURCES & LIMITATIONS */}
        <section aria-labelledby="stage-4-heading" className="print-break-avoid pt-10">
          <h2 id="stage-4-heading" className="text-xl font-bold tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            {t.stage4Title}
          </h2>

          {satelliteWarning && (
            <div
              role="note"
              className="mt-4 flex items-start gap-3 py-3 text-sm"
              style={{
                borderTop: '1px solid var(--hairline)',
                borderBottom: '1px solid var(--hairline)',
              }}
            >
              <CloudOff
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: 'var(--risk-moderate-ink)' }}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="font-medium leading-relaxed" style={{ color: 'var(--ink-primary)' }}>
                {satelliteWarning}
              </p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink-muted)' }}>
                {t.sourcesHeading}
              </h3>
              <ul
                className="mt-3 list-disc space-y-2 pl-4 text-sm leading-relaxed"
                style={{ color: 'var(--ink-secondary)' }}
              >
                {step4_sourcesAndLimitations.sources.map((src) => (
                  <li key={src}>{src}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink-muted)' }}>
                {t.limitationsHeading}
              </h3>
              <ul
                className="mt-3 list-disc space-y-2 pl-4 text-sm leading-relaxed"
                style={{ color: 'var(--ink-secondary)' }}
              >
                {step4_sourcesAndLimitations.limitationsPl.map((lim) => (
                  <li key={lim}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
