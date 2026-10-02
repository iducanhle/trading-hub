import { T212Side, T212Trade } from '../../../../core/models/contract';
import { dayIn } from '../../../portfolio/portfolio-model';

export interface TradeMark {
  /** A bar's date (YYYY-MM-DD). */
  date: string;
  side: T212Side;
  count: number;
}

/** The exchange's day of a trade: US listings by New York time, European ones by Central European time. */
export function tradeDay(executedAt: string, symbol: string): string {
  return dayIn(executedAt, symbol.includes('.') ? 'Europe/Berlin' : 'America/New_York');
}

/**
 * One mark per day and side for the user's trades (corporate actions left out), placed on the first bar on or
 * after the trade's day; trades outside the bars are left out.
 */
export function tradeMarks(
  trades: readonly T212Trade[],
  symbol: string,
  barDates: readonly string[],
): TradeMark[] {
  if (barDates.length === 0) return [];
  const first = barDates[0];
  const last = barDates[barDates.length - 1];
  const marks = new Map<string, TradeMark>();
  for (const trade of trades) {
    if (trade.kind !== 'TRADE') continue;
    const day = tradeDay(trade.executedAt, symbol);
    if (day < first || day > last) continue;
    const date = barDates.find((d) => d >= day);
    if (!date) continue;
    const key = `${date}|${trade.side}`;
    const mark = marks.get(key);
    if (mark) mark.count++;
    else marks.set(key, { date, side: trade.side, count: 1 });
  }
  return [...marks.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.side.localeCompare(b.side),
  );
}
