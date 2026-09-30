import { LANGUAGE } from '../../core/i18n/language';
import { APP_LOCALE } from './locale';

// Contract dates are 'YYYY-MM-DD' trading dates. They are handled as calendar dates (never shifted by time
// zones): arithmetic runs in UTC, and display builds a local Date for the same calendar day.

const DAY_MS = 86_400_000;

function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The calendar day of a local Date, as 'YYYY-MM-DD'. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** A local Date at midnight of the given calendar day (for Intl formatting). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (new Date(toUtcMs(iso)).getUTCDay() + 6) % 7;
}

export function isWeekend(iso: string): boolean {
  return weekdayIndex(iso) >= 5;
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function endOfMonth(iso: string): string {
  return addDays(addMonths(iso, 1), -1);
}

/** The 6-week (42-day) grid of a month view, Monday first: the API's maximum span. */
export function monthGrid(iso: string): { from: string; to: string } {
  const from = startOfWeek(startOfMonth(iso));
  return { from, to: addDays(from, 41) };
}

/** Every date from `from` to `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Monday first. */
export const WEEKDAYS_SHORT = [
  $localize`:Monday, short:Mon`,
  $localize`:Tuesday, short:Tue`,
  $localize`:Wednesday, short:Wed`,
  $localize`:Thursday, short:Thu`,
  $localize`:Friday, short:Fri`,
  $localize`:Saturday, short:Sat`,
  $localize`:Sunday, short:Sun`,
];

const dateFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

export type DateStyle =
  'day' | 'dayMonth' | 'medium' | 'long' | 'monthYear' | 'weekday' | 'weekdayShort';

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  /** Fri 25 Sep */
  day: { weekday: 'short', day: 'numeric', month: 'short' },
  /** 25 Sep */
  dayMonth: { day: 'numeric', month: 'short' },
  /** 25 Sep 2026 */
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  /** Friday 25 September 2026 */
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  /** Sep 2026 */
  monthYear: { month: 'short', year: 'numeric' },
  /** Friday */
  weekday: { weekday: 'long' },
  /** Fri */
  weekdayShort: { weekday: 'short' },
};

export function formatDate(
  iso: string | null | undefined,
  style: DateStyle = 'medium',
  locale = APP_LOCALE,
): string {
  if (!iso) return '—';
  return dateFormat(locale, DATE_STYLES[style]).format(parseIsoDate(iso.slice(0, 10)));
}

/** `22–26 Sep`, `29 Sep – 3 Oct`, with the year: `22–28 Sep 2026`. */
export function formatDateRange(
  from: string,
  to: string,
  withYear = false,
  locale = APP_LOCALE,
): string {
  const options: Intl.DateTimeFormatOptions = withYear
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' };
  return dateFormat(locale, options).formatRange(parseIsoDate(from), parseIsoDate(to));
}

/** `September 2026` */
export function formatMonthTitle(iso: string, locale = APP_LOCALE): string {
  return dateFormat(locale, { month: 'long', year: 'numeric' }).format(parseIsoDate(iso));
}

const relative = new Intl.RelativeTimeFormat(LANGUAGE, { numeric: 'auto' });

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Countdown to a date: `Today`, `Tomorrow`, `In 3 days`, `In 2 weeks`, `Yesterday`, `5 days ago`. */
export function relativeDay(iso: string, today: string = todayIso()): string {
  const days = diffDays(today, iso);
  if (Math.abs(days) < 14) return capitalize(relative.format(days, 'day'));
  if (Math.abs(days) < 60) return capitalize(relative.format(Math.trunc(days / 7), 'week'));
  return capitalize(relative.format(Math.trunc(days / 30), 'month'));
}

/** Age of a timestamp, for news: `Just now`, `12m ago`, `3h ago`, `2d ago`, then the date. */
export function timeAgo(timestamp: string, now: Date = new Date(), locale = APP_LOCALE): string {
  const then = new Date(timestamp);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (Number.isNaN(minutes)) return '—';
  if (minutes < 1) return $localize`Just now`;
  if (minutes < 60) return $localize`${minutes}:minutes:m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return $localize`${hours}:hours:h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return $localize`${days}:days:d ago`;
  return formatDate(toIsoDate(then), 'dayMonth', locale);
}

/** Clock time of a timestamp in the device's time zone: `14:05` / `2:05 PM`. */
export function formatTime(timestamp: string, locale = APP_LOCALE): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** `25 Sep, 14:05` for "as of" hints. */
export function formatDateTime(timestamp: string, locale = APP_LOCALE): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
