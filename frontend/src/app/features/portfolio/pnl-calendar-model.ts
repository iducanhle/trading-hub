import { T212HistoryPoint } from '../../core/models/contract';
import {
  addDays,
  endOfMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
  weekdayIndex,
} from '../../shared/utils/dates';

/** The account's profit/loss over one day, week or month. */
export interface PnlRow {
  /** First calendar day of the period ('YYYY-MM-DD', Europe/Prague). */
  periodStart: string;
  /** Last calendar day of the period (Friday for a week). */
  periodEnd: string;
  /** Change of the all-time profit, so deposits and withdrawals never count; null when one is not known. */
  pnl: number | null;
  /** Percent of the account value at the start; weeks and months compound their days. */
  pnlPct: number | null;
}

export interface TodayPnl {
  pnl: number | null;
  pnlPct: number | null;
}

const PRAGUE_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Europe/Prague calendar day of an instant, the day the server's daily history intervals use. */
export function pragueDate(at: string | Date): string {
  return PRAGUE_DAY.format(typeof at === 'string' ? new Date(at) : at);
}

/**
 * One row per weekday from the daily history points (the last point of each day): the change of the profit since the
 * previous weekday's point, in percent of that point's value. Weekend changes count on Monday; a day without a point
 * gets no row, and the next one covers it. Today takes the summary's figure (since the previous US close), so it
 * matches the account header.
 */
export function dailyPnl(
  points: readonly T212HistoryPoint[],
  today: string,
  todayPnl: TodayPnl | null = null,
): PnlRow[] {
  const byDate = new Map<string, T212HistoryPoint>();
  for (const point of points) byDate.set(pragueDate(point.at), point);
  const rows: PnlRow[] = [];
  let base: T212HistoryPoint | null = null;
  for (const [date, point] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (isWeekend(date)) {
      base ??= point;
      continue;
    }
    if (base) {
      let pnl =
        point.profit !== null && base.profit !== null ? point.profit - base.profit : null;
      let pnlPct = pnl !== null && base.value > 0 ? (pnl / base.value) * 100 : null;
      if (date === today && todayPnl?.pnl != null) {
        pnl = todayPnl.pnl;
        pnlPct = todayPnl.pnlPct;
      }
      rows.push({ periodStart: date, periodEnd: date, pnl, pnlPct });
    }
    base = point;
  }
  return rows;
}

/** Days added up per week (Monday to Friday) or calendar month: amounts summed, percentages compounded. */
export function groupPnl(days: readonly PnlRow[], by: 'WEEK' | 'MONTH'): PnlRow[] {
  const groups = new Map<string, PnlRow[]>();
  for (const day of days) {
    const key = by === 'WEEK' ? startOfWeek(day.periodStart) : startOfMonth(day.periodStart);
    const group = groups.get(key);
    if (group) group.push(day);
    else groups.set(key, [day]);
  }
  return [...groups].map(([start, group]) =>
    // Never null: every group has at least one day.
    sumPnl(start, by === 'WEEK' ? addDays(start, 4) : endOfMonth(start), group)!,
  );
}

/** The days from `start` to `end` (inclusive) as one period; null when none of them is known. */
export function sumPnl(start: string, end: string, days: readonly PnlRow[]): PnlRow | null {
  const inside = days.filter((d) => d.periodStart >= start && d.periodStart <= end);
  if (!inside.length) return null;
  const amounts = inside.map((d) => d.pnl).filter((v) => v !== null);
  const percents = inside.map((d) => d.pnlPct).filter((v) => v !== null);
  return {
    periodStart: start,
    periodEnd: end,
    pnl: amounts.length ? amounts.reduce((sum, v) => sum + v, 0) : null,
    pnlPct: percents.length
      ? (percents.reduce((growth, v) => growth * (1 + v / 100), 1) - 1) * 100
      : null,
  };
}

/** How many of a week's weekdays (from `monday`) have begun by `today`: 0 for a future week, 5 for a past one. */
export function elapsedWeekdays(monday: string, today: string): number {
  if (today < monday) return 0;
  if (today > addDays(monday, 4)) return 5;
  return weekdayIndex(today) + 1;
}
