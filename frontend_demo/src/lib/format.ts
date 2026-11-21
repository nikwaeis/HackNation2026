import type { DeficitLevel, Priority } from '../api/types';

const MONTHS_NOMINATIVE = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

export function monthName(month: number): string {
  return MONTHS_NOMINATIVE[month - 1] ?? String(month);
}

/** [5, 6] → "maj–czerwiec"; [4, 6, 8] → "kwiecień, czerwiec, sierpień" */
export function monthsLabel(months: number[]): string {
  if (months.length === 0) return '';
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted.every((m, i) => i === 0 || m === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 1) return `${monthName(sorted[0])}–${monthName(sorted[sorted.length - 1])}`;
  return sorted.map(monthName).join(', ');
}

const numberFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const numberFmt2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function num(value: number | null | undefined, digits: 1 | 2 = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return (digits === 2 ? numberFmt2 : numberFmt).format(value);
}

/** Signed number with a real minus sign, e.g. "−148,2". */
export function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const s = numberFmt.format(Math.abs(value));
  return value < 0 ? `−${s}` : value > 0 ? `+${s}` : s;
}

/** "2026-06-15" → "15 czerwca 2026" */
export function dateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Polish plural: 1 dzień, 2 dni, 5 dni */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const DEFICIT_LABEL: Record<DeficitLevel, { title: string; hint: string }> = {
  LOW: { title: 'Niski niedobór wody', hint: 'Wody w glebie jest wystarczająco. Warto ją utrzymać.' },
  MODERATE: { title: 'Umiarkowany niedobór wody', hint: 'Rośliny zaczynają odczuwać brak wody. Działaj zapobiegawczo.' },
  HIGH: { title: 'Wysoki niedobór wody', hint: 'Brak wody może obniżyć plon. Potrzebne są działania.' },
  CRITICAL: { title: 'Krytyczny niedobór wody', hint: 'Susza zagraża plonowi. Działaj natychmiast.' },
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  HIGH: 'Priorytet wysoki',
  MEDIUM: 'Priorytet średni',
  LOW: 'Priorytet niski',
};

export const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function urgencyLabel(urgency: string | null): string {
  switch (urgency?.toUpperCase()) {
    case 'LOW':
      return 'Niska pilność';
    case 'MODERATE':
    case 'MEDIUM':
      return 'Umiarkowana pilność';
    case 'HIGH':
      return 'Wysoka pilność';
    case 'CRITICAL':
      return 'Pilne — działaj natychmiast';
    case 'NONE':
      return 'Brak potrzeby';
    default:
      return urgency || '—';
  }
}

/** YYYY-MM-DD in the user's local time zone. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function tenYearsAgoIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return toIsoDate(d);
}

/** Loose TERYT parcel id check, e.g. 040101_1.0001.123/4 */
export const DZIALKA_ID_PATTERN = /^\d{6}_\d\.\d{4}\.\S+$/;
