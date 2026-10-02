import { T212PeriodQuery } from '../../core/api/api.service';
import { T212Instrument, T212PositionStatus, T212Trade } from '../../core/models/contract';
import { addDays, todayIso } from '../../shared/utils/dates';

/** The device's IANA time zone; periods are whole days there. */
export const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export type PeriodPreset = '1M' | '3M' | 'YTD' | '1Y' | 'ALL' | 'CUSTOM';
export const PERIOD_PRESETS: readonly PeriodPreset[] = ['1M', '3M', 'YTD', '1Y', 'ALL', 'CUSTOM'];

export interface PortfolioPeriod {
  preset: PeriodPreset;
  /** Inclusive days; both null for all time. */
  from: string | null;
  to: string | null;
}

export type PortfolioTab = 'overview' | 'stocks' | 'trades' | 'cash';
export const PORTFOLIO_TABS: readonly PortfolioTab[] = ['overview', 'stocks', 'trades', 'cash'];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The same day `months` earlier (or later), clamped to the month's length: 31 Mar − 1 month = 28/29 Feb. */
export function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The days a preset covers, ending today. */
export function presetRange(
  preset: Exclude<PeriodPreset, 'CUSTOM'>,
  today: string = todayIso(),
): { from: string | null; to: string | null } {
  switch (preset) {
    case '1M':
      return { from: addDays(shiftMonths(today, -1), 1), to: today };
    case '3M':
      return { from: addDays(shiftMonths(today, -3), 1), to: today };
    case 'YTD':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case '1Y':
      return { from: addDays(shiftMonths(today, -12), 1), to: today };
    case 'ALL':
      return { from: null, to: null };
  }
}

/**
 * The period from the URL (`?period=3M`, or `?period=CUSTOM&from=…&to=…`). Anything unknown is all time; a custom
 * period without valid days is all time too, and reversed days are swapped.
 */
export function parsePeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  today: string = todayIso(),
): PortfolioPeriod {
  const preset = PERIOD_PRESETS.includes(params.period as PeriodPreset)
    ? (params.period as PeriodPreset)
    : 'ALL';
  if (preset !== 'CUSTOM') return { preset, ...presetRange(preset, today) };
  let from = params.from && ISO_DAY.test(params.from) ? params.from : null;
  let to = params.to && ISO_DAY.test(params.to) ? params.to : null;
  if (!from && !to) return { preset: 'ALL', from: null, to: null };
  if (from && to && from > to) [from, to] = [to, from];
  return { preset, from, to };
}

/** Switching to Custom keeps the days shown so far, or starts with the last month when it was all time. */
export function addCustomDefaults(
  current: PortfolioPeriod,
  today: string = todayIso(),
): PortfolioPeriod {
  const range = isAllTime(current) ? presetRange('1M', today) : current;
  return { preset: 'CUSTOM', from: range.from, to: range.to };
}

/** Query parameters that describe a period in the URL (null removes a parameter). */
export function periodParams(period: PortfolioPeriod): Record<string, string | null> {
  return {
    period: period.preset === 'ALL' ? null : period.preset,
    from: period.preset === 'CUSTOM' ? period.from : null,
    to: period.preset === 'CUSTOM' ? period.to : null,
  };
}

export function isAllTime(period: PortfolioPeriod): boolean {
  return period.from === null && period.to === null;
}

export function periodQuery(period: PortfolioPeriod, tz: string = DEVICE_TZ): T212PeriodQuery {
  return { from: period.from, to: period.to, tz };
}

export type StatusFilter = T212PositionStatus | 'ALL';
export type StockSort = 'pnl' | 'pnlPct' | 'value' | 'lastTrade' | 'name';

/** Status and a name/ticker/symbol search (case-insensitive). */
export function filterInstruments(
  items: readonly T212Instrument[],
  status: StatusFilter,
  search: string,
): T212Instrument[] {
  const q = search.trim().toLowerCase();
  return items.filter(
    (i) =>
      (status === 'ALL' || i.status === status) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        i.t212Ticker.toLowerCase().includes(q) ||
        (i.symbol ?? '').toLowerCase().includes(q)),
  );
}

/** Highest first for numbers (missing values last), newest first for the last trade, A–Z for names. */
export function sortInstruments(
  items: readonly T212Instrument[],
  sort: StockSort,
): T212Instrument[] {
  const desc =
    (pick: (i: T212Instrument) => number | null) => (a: T212Instrument, b: T212Instrument) => {
      const x = pick(a);
      const y = pick(b);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x || a.name.localeCompare(b.name);
    };
  const sorted = [...items];
  switch (sort) {
    case 'pnl':
      return sorted.sort(desc((i) => i.totalPnl));
    case 'pnlPct':
      return sorted.sort(desc((i) => i.totalPnlPct));
    case 'value':
      return sorted.sort(desc((i) => i.value));
    case 'lastTrade':
      return sorted.sort(desc((i) => (i.lastTradeAt ? Date.parse(i.lastTradeAt) : null)));
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** The calendar day of an instant in a time zone. */
export function dayIn(iso: string, tz: string = DEVICE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Newest-first items grouped by their day in `tz`, keeping the order. */
export function groupByDay<T>(
  items: readonly T[],
  at: (item: T) => string,
  tz: string = DEVICE_TZ,
): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const item of items) {
    const date = dayIn(at(item), tz);
    const last = groups[groups.length - 1];
    if (last?.date === date) last.items.push(item);
    else groups.push({ date, items: [item] });
  }
  return groups;
}

export function groupTradesByDay(trades: readonly T212Trade[], tz: string = DEVICE_TZ) {
  return groupByDay(trades, (t) => t.executedAt, tz);
}

/** A short ticker to show: the mapped symbol, else the Trading 212 ticker without its suffix (`VUSAl_EQ` → `VUSA`). */
export function displayTicker(item: { symbol: string | null; t212Ticker: string }): string {
  if (item.symbol) return item.symbol;
  return item.t212Ticker
    .replace(/_[A-Z]{2}_EQ$/, '')
    .replace(/[a-z]?_EQ$/, '')
    .replace(/_/g, '-');
}
