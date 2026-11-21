import type { ReactNode } from 'react';
import { Cloud, CloudOff, CloudRain, History, Layers, Mountain, Sun, SunDim, Waves } from 'lucide-react';
import type { DeficitLevel, SatelliteStatus, WaterAssessment } from '../../api/types';
import { DEFICIT_LABEL, num, plural, signed } from '../../lib/format';
import { Badge, Panel } from '../ui';
import { StepSection } from './StepSection';

const DEFICIT_STYLE: Record<DeficitLevel, { panel: string; dot: string }> = {
  LOW: { panel: 'bg-field-soft border-field/30 text-ink', dot: 'bg-field' },
  MODERATE: { panel: 'bg-ochre-soft border-ochre/30 text-ink', dot: 'bg-ochre' },
  HIGH: { panel: 'bg-dry-soft border-dry/30 text-ink', dot: 'bg-dry' },
  CRITICAL: { panel: 'bg-dry border-dry text-white', dot: 'bg-white' },
};

const LEVELS: DeficitLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

function DeficitHero({ level }: { level: DeficitLevel }) {
  const style = DEFICIT_STYLE[level] ?? DEFICIT_STYLE.MODERATE;
  const label = DEFICIT_LABEL[level] ?? { title: level, hint: '' };
  const idx = LEVELS.indexOf(level);
  return (
    <div className={`print-avoid-break flex flex-col justify-between gap-4 rounded-2xl border p-5 sm:p-6 ${style.panel}`}>
      <div>
        <p className={`text-sm font-semibold ${level === 'CRITICAL' ? 'text-white/85' : 'text-muted'}`}>Poziom niedoboru wody</p>
        <p className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{label.title}</p>
        <p className={`mt-2 ${level === 'CRITICAL' ? 'text-white/90' : 'text-ink/80'}`}>{label.hint}</p>
      </div>
      {/* 4-step scale so the farmer sees where this level sits */}
      <div aria-hidden className="flex gap-1.5">
        {LEVELS.map((l, i) => (
          <span
            key={l}
            className={`h-2 flex-1 rounded-full ${i <= idx ? style.dot : level === 'CRITICAL' ? 'bg-white/30' : 'bg-ink/10'}`}
          />
        ))}
      </div>
    </div>
  );
}

/** The 90-day "water budget": what rain delivered vs how much water the crop and soil used up. */
function WaterBudget({ rain, need, balance, areaHa }: { rain: number | null; need: number | null; balance: number | null; areaHa: number | null }) {
  const m3Fmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
  const m3Note = (bal: number) => {
    const m3PerHa = Math.abs(bal) * 10;
    const m3Parcel = areaHa ? m3PerHa * areaHa : null;
    return (
      <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm">
        1 mm wody to 10 m³ (10 000 litrów) na hektar. {bal < 0 ? 'Brakująca woda' : 'Nadwyżka'} to ok.{' '}
        <strong>{m3Fmt.format(m3PerHa)} m³ na hektar</strong>
        {m3Parcel != null && (
          <>
            , czyli ok. <strong>{m3Fmt.format(m3Parcel)} m³</strong> na całej działce
          </>
        )}
        .
      </p>
    );
  };

  if (rain == null || need == null) {
    return balance != null ? (
      <Panel className="print-avoid-break p-5 sm:p-6">
        <h3 className="text-xl font-bold">Bilans wodny z ostatnich 90 dni</h3>
        <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${balance < 0 ? 'text-dry' : 'text-field'}`}>{signed(balance)} mm</p>
        {m3Note(balance)}
      </Panel>
    ) : null;
  }
  const et0 = need;
  const bal = balance ?? rain - et0;
  const deficit = bal < 0;
  const total = Math.max(rain, et0) || 1;
  const rainPct = (Math.min(rain, et0) / total) * 100;
  const restPct = 100 - rainPct;

  return (
    <Panel className="print-avoid-break p-5 sm:p-6">
      <h3 className="text-xl font-bold">Bilans wodny z ostatnich 90 dni</h3>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Porównanie wody, która spadła z deszczem, z wodą, której w tym czasie potrzebowała uprawa (parowanie z gleby i roślin).
      </p>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between gap-3 text-sm">
          <span className="font-semibold">
            {deficit ? 'Uprawa potrzebowała' : 'Spadło deszczu'}{' '}
            <span className="tabular-nums">{num(deficit ? et0 : rain)} mm</span>
          </span>
        </div>
        <div className="flex h-12 overflow-hidden rounded-xl border border-line sm:h-14" role="img"
          aria-label={`Opady ${num(rain)} mm, potrzeby uprawy ${num(et0)} mm, bilans ${signed(bal)} mm`}>
          <div className="flex items-center bg-water px-3 text-sm font-bold text-white" style={{ width: `${deficit ? rainPct : (et0 / total) * 100}%` }}>
            <span className="truncate">{deficit ? `deszcz ${num(rain)} mm` : `potrzeby ${num(et0)} mm`}</span>
          </div>
          {restPct > 0 && (
            <div
              className={`flex items-center justify-end px-3 text-sm font-bold ${deficit ? 'hatch-deficit text-dry' : 'bg-field-soft text-field'}`}
              style={{ width: `${restPct}%` }}
            >
              <span className="truncate">{deficit ? `brak ${num(Math.abs(bal))} mm` : `zapas ${num(bal)} mm`}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted">Spadło deszczu</p>
          <p className="font-display text-2xl font-bold tabular-nums">{num(rain)} mm</p>
        </div>
        <div>
          <p className="text-sm text-muted">Potrzeby uprawy</p>
          <p className="font-display text-2xl font-bold tabular-nums">{num(et0)} mm</p>
        </div>
        <div>
          <p className="text-sm text-muted">Bilans</p>
          <p className={`font-display text-2xl font-bold tabular-nums ${deficit ? 'text-dry' : 'text-field'}`}>{signed(bal)} mm</p>
        </div>
      </div>

      {m3Note(bal)}
    </Panel>
  );
}

/** Static facts about the parcel that explain the causes in step 2 (sent by the backend). */
function FieldFacts({ slopeDeg, sandPct, nearestWaterDistM }: { slopeDeg: number | null; sandPct: number | null; nearestWaterDistM: number | null }) {
  const facts = [
    slopeDeg != null && {
      icon: <Mountain className="size-4 text-muted" aria-hidden />,
      label: 'Nachylenie terenu',
      value: `${num(slopeDeg)}°`,
      hint: slopeDeg >= 3 ? 'Woda szybciej spływa z pola.' : 'Teren płaski, woda wolniej spływa.',
    },
    sandPct != null && {
      icon: <Layers className="size-4 text-muted" aria-hidden />,
      label: 'Piasek w glebie',
      value: `${num(sandPct)}%`,
      hint: sandPct >= 60 ? 'Gleba lekka, słabo trzyma wodę.' : 'Gleba lepiej zatrzymuje wodę.',
    },
    nearestWaterDistM != null && {
      icon: <Waves className="size-4 text-muted" aria-hidden />,
      label: 'Najbliższy rów lub ciek',
      value: nearestWaterDistM >= 1000 ? `${num(nearestWaterDistM / 1000)} km` : `${Math.round(nearestWaterDistM)} m`,
      hint: nearestWaterDistM <= 300 ? 'Blisko — można spowolnić odpływ.' : 'Daleko od działki.',
    },
  ].filter(Boolean) as { icon: ReactNode; label: string; value: string; hint: string }[];

  if (facts.length === 0) return null;
  return (
    <Panel className="print-avoid-break p-5 sm:p-6">
      <h3 className="text-lg font-bold">Pole i jego otoczenie</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="flex items-center gap-1.5 text-sm text-muted">
              {f.icon} {f.label}
            </dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{f.value}</dd>
            <dd className="text-sm text-muted">{f.hint}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function RainVsNorm({ rain90, norm90, rain30 }: { rain90: number | null; norm90: number | null; rain30: number | null }) {
  const pct = rain90 != null && norm90 ? Math.round((rain90 / norm90) * 100) : null;
  const max = Math.max(rain90 ?? 0, norm90 ?? 0) || 1;
  const tone = pct == null ? 'text-ink' : pct < 60 ? 'text-dry' : pct < 85 ? 'text-ochre' : 'text-field';

  return (
    <Panel className="print-avoid-break p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CloudRain className="mt-0.5 size-5 shrink-0 text-water" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold">Opady na tle normy</h3>
          {pct != null && (
            <p className="text-sm text-muted">
              W ostatnich 90 dniach spadło <strong className={tone}>{pct}%</strong> tego, co zwykle w tym okresie (średnia z 10 lat).
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {[
          { label: 'Ostatnie 90 dni', value: rain90, cls: 'bg-water' },
          { label: 'Średnio w tym okresie (10 lat)', value: norm90, cls: 'bg-ink/25' },
        ].map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-sm">
              <span>{row.label}</span>
              <span className="font-semibold tabular-nums">{num(row.value)} mm</span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-paper">
              <div className={`h-full rounded-full ${row.cls}`} style={{ width: `${((row.value ?? 0) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      {rain30 != null && (
        <p className="mt-4 border-t border-line pt-3 text-sm">
          Ostatnie 30 dni: <strong className="tabular-nums">{num(rain30)} mm</strong> deszczu
        </p>
      )}
    </Panel>
  );
}

function DrySpell({ days }: { days: number | null }) {
  return (
    <Panel className="print-avoid-break p-5 sm:p-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Sun className="size-4 text-ochre" aria-hidden /> Najdłuższy okres bez deszczu
      </div>
      <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
        {days ?? '—'} <span className="text-xl font-bold">{days != null ? plural(days, 'dzień', 'dni', 'dni') : ''}</span>
      </p>
      <p className="mt-1 text-sm text-muted">z rzędu bez znaczącego opadu w ostatnich 90 dniach</p>
    </Panel>
  );
}

function DroughtYears({ years }: { years: number | null }) {
  return (
    <Panel className="print-avoid-break p-5 sm:p-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <History className="size-4 text-water" aria-hidden /> Susza w tym okresie w poprzednich latach
      </div>
      <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
        {years ?? '—'} <span className="text-xl font-bold">z 10 lat</span>
      </p>
      {years != null && (
        <div className="mt-3 grid grid-cols-10 gap-1" role="img" aria-label={`${years} lat suchych z 10`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`h-5 rounded ${i < years ? 'bg-ochre' : 'bg-field-soft border border-field/20'}`} />
          ))}
        </div>
      )}
    </Panel>
  );
}

interface IndexScale {
  min: number;
  max: number;
  zones: { upTo: number; label: string; color: string }[];
}

const NDVI_SCALE: IndexScale = {
  min: -0.2,
  max: 1,
  zones: [
    { upTo: 0.2, label: 'gleba bez roślin lub rośliny bardzo słabe', color: '#b4895a' },
    { upTo: 0.5, label: 'rośliny rzadkie lub osłabione', color: '#c9c35a' },
    { upTo: 1, label: 'rośliny gęste i w dobrej kondycji', color: '#4c7a25' },
  ],
};

const NDWI_SCALE: IndexScale = {
  min: -0.6,
  max: 0.6,
  zones: [
    { upTo: -0.2, label: 'rośliny i gleba wyraźnie przesuszone', color: '#b42318' },
    { upTo: 0, label: 'rośliny umiarkowanie suche', color: '#d39a3a' },
    { upTo: 0.2, label: 'rośliny dobrze uwodnione', color: '#6fa8d0' },
    { upTo: 0.6, label: 'bardzo wilgotno, możliwa woda na powierzchni', color: '#1d6aa3' },
  ],
};

function SatelliteIndex({ name, what, value, scale }: { name: string; what: string; value: number | null; scale: IndexScale }) {
  const clamped = value == null ? null : Math.min(scale.max, Math.max(scale.min, value));
  const pos = clamped == null ? 0 : ((clamped - scale.min) / (scale.max - scale.min)) * 100;
  const zone = value == null ? null : scale.zones.find((z) => value <= z.upTo) ?? scale.zones[scale.zones.length - 1];
  let prev = scale.min;
  const stops = scale.zones
    .map((z) => {
      const a = ((prev - scale.min) / (scale.max - scale.min)) * 100;
      const b = ((z.upTo - scale.min) / (scale.max - scale.min)) * 100;
      prev = z.upTo;
      return `${z.color} ${a}% ${b}%`;
    })
    .join(', ');

  return (
    <div className="print-avoid-break">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-bold">
          {name} <span className="font-normal text-muted">— {what}</span>
        </h4>
        {value == null ? (
          <Badge tone="neutral" icon={<CloudOff className="size-3.5" aria-hidden />}>
            Brak danych satelitarnych
          </Badge>
        ) : (
          <span className="font-display text-2xl font-bold tabular-nums">{num(value, 2)}</span>
        )}
      </div>
      <div className="relative mt-2 h-3 rounded-full" style={{ background: `linear-gradient(to right, ${stops})`, opacity: value == null ? 0.35 : 1 }}>
        {value != null && (
          <span
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-ink shadow"
            style={{ left: `${pos}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
        <span>{num(scale.min, 1)}</span>
        <span>{num(scale.max, 1)}</span>
      </div>
      {zone && (
        <p className="mt-1 text-sm">
          Wynik oznacza: <strong>{zone.label}</strong>.
        </p>
      )}
    </div>
  );
}

function SatellitePanel({ ndvi, ndwi, status }: { ndvi: number | null; ndwi: number | null; status: SatelliteStatus | null }) {
  const none = status === 'NO_DATA' || (ndvi == null && ndwi == null);
  const cloudy = !none && status === 'CLOUDY_FALLBACK';
  return (
    <Panel className="print-avoid-break p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">Co widać z satelity</h3>
          <p className="max-w-prose text-sm text-muted">
            Wskaźniki ze zdjęć Sentinel-2, uśrednione dla całej działki. Skale są orientacyjne.
          </p>
        </div>
        {none && (
          <Badge tone="ochre" icon={<CloudOff className="size-3.5" aria-hidden />}>
            Brak danych satelitarnych
          </Badge>
        )}
        {cloudy && (
          <Badge tone="ochre" icon={<Cloud className="size-3.5" aria-hidden />} title="Zdjęcie z zachmurzeniem 20–50%">
            Zdjęcie częściowo zachmurzone
          </Badge>
        )}
      </div>
      {cloudy && (
        <p className="mt-2 text-sm text-ochre">Część pola mogła być pod chmurami, więc wskaźniki są mniej pewne.</p>
      )}
      {none ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-paper px-4 py-3 text-sm">
          <SunDim className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          W okresie około 15 dni przed i po wybranej dacie pole było zasłonięte chmurami albo nie ma zdjęć. Ocena opiera się na
          danych pogodowych, glebie i ukształtowaniu terenu.
        </p>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <SatelliteIndex name="NDVI" what="kondycja i gęstość roślin" value={ndvi} scale={NDVI_SCALE} />
          <SatelliteIndex name="NDWI" what="zawartość wody w roślinach" value={ndwi} scale={NDWI_SCALE} />
        </div>
      )}
    </Panel>
  );
}

export function Step1WaterAssessment({
  data,
  areaHa,
  satelliteStatus,
}: {
  data: WaterAssessment;
  areaHa: number | null;
  satelliteStatus: SatelliteStatus | null;
}) {
  const m = data.metrics;
  return (
    <StepSection
      number={1}
      id="ocena"
      title="Ocena sytuacji wodnej"
      lead="Ile wody jest teraz na Twoim polu i jak wypada to na tle ostatnich 10 lat."
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <DeficitHero level={data.deficitLevel} />
          <Panel className="print-avoid-break flex flex-col gap-4 p-5 sm:p-6">
            <p className="text-lg leading-relaxed">{data.summaryPl}</p>
            {data.historicalRiskPl && (
              <div className="border-t border-line pt-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                  <History className="size-4" aria-hidden /> Na tle ostatnich 10 lat
                </p>
                <p className="mt-1">{data.historicalRiskPl}</p>
              </div>
            )}
          </Panel>
        </div>

        <WaterBudget rain={m.precip90dMm} need={m.waterNeed90dMm} balance={m.waterBalanceMm} areaHa={areaHa} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RainVsNorm rain90={m.precip90dMm} norm90={m.precip10yrAvg90dMm} rain30={m.precip30dMm} />
          <DrySpell days={m.drySpellDays} />
          <DroughtYears years={m.historicalDroughtYears} />
        </div>

        <FieldFacts slopeDeg={m.slopeDeg} sandPct={m.sandPct} nearestWaterDistM={m.nearestWaterDistM} />

        <SatellitePanel ndvi={m.ndviMean} ndwi={m.ndwiMean} status={satelliteStatus} />
      </div>
    </StepSection>
  );
}
