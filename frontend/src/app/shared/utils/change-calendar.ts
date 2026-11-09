import { addDays, endOfMonth, isWeekend, startOfMonth, weekdayIndex } from './dates';

// Month calendars of period changes, shared by the stock's performance history and the account's profit/loss
// calendar: Monday-to-Friday columns, one square per weekday, tinted green or red by the size of the move.

export interface CalendarCell<T> {
  date: string;
  day: number;
  /** Null on a weekday without data (a holiday, a gap, or not reached yet). */
  row: T | null;
}

/**
 * The weekdays of a month in Monday-to-Friday columns, with null blanks before the first one; each carries the row
 * starting on that day when there is one.
 */
export function calendarCells<T extends { periodStart: string }>(
  month: string,
  rows: readonly T[],
): (CalendarCell<T> | null)[] {
  const byDate = new Map(rows.map((row) => [row.periodStart, row]));
  const cells: (CalendarCell<T> | null)[] = [];
  const last = endOfMonth(month);
  for (let date = startOfMonth(month); date <= last; date = addDays(date, 1)) {
    if (isWeekend(date)) continue;
    if (!cells.length) cells.push(...Array<null>(weekdayIndex(date)).fill(null));
    cells.push({ date, day: Number(date.slice(8)), row: byDate.get(date) ?? null });
  }
  return cells;
}

/** The days of a month's calendar in Monday-to-Friday rows, each padded to five cells (without rows). */
export function calendarWeeks(month: string): (CalendarCell<unknown> | null)[][] {
  const cells: (CalendarCell<unknown> | null)[] = calendarCells<{ periodStart: string }>(month, []);
  const weeks: (CalendarCell<unknown> | null)[][] = [];
  for (let i = 0; i < cells.length; i += 5) {
    const week = cells.slice(i, i + 5);
    while (week.length < 5) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** How strongly a square is tinted: 0 (no change or no data) to 4 (a move of 5 % or more). */
export function intensity(percent: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (percent == null || !Number.isFinite(percent) || percent === 0) return 0;
  const size = Math.abs(percent);
  return size < 1 ? 1 : size < 2.5 ? 2 : size < 5 ? 3 : 4;
}

const MIX = [0, 14, 26, 42, 80];

/** The square's background: the gain or loss colour mixed into the surface by the size of the move. */
export function changeTint(percent: number | null | undefined): string {
  const level = intensity(percent);
  if (!level) return 'var(--mat-sys-surface-container-high)';
  const tone = percent! > 0 ? 'var(--app-gain)' : 'var(--app-loss)';
  return `color-mix(in oklab, ${tone} ${MIX[level]}%, var(--mat-sys-surface))`;
}

/** The strongest tint takes the surface colour as text (white in light mode, dark in dark mode) for contrast. */
export function changeInk(percent: number | null | undefined): string {
  return intensity(percent) === 4 ? 'var(--mat-sys-surface)' : 'var(--mat-sys-on-surface)';
}
