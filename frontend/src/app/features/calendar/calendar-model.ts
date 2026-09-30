import { CalendarDay, EarningsEvent, RegionFilter, ReportTime } from '../../core/models/contract';
import { addDays, addMonths, monthGrid, startOfMonth, startOfWeek } from '../../shared/utils/dates';

export type CalendarView = 'week' | 'month';

export interface CalendarFilters {
  /** 0 = all (including unknown market caps). */
  minMarketCapUsd: number;
  region: RegionFilter;
  followedOnly: boolean;
}

export const DEFAULT_FILTERS: CalendarFilters = {
  minMarketCapUsd: 2e9,
  region: 'ALL',
  followedOnly: false,
};

export const CAP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: $localize`:Market cap filter\: every company:All` },
  { value: 3e8, label: $localize`:Market cap filter:>$300M` },
  { value: 2e9, label: $localize`:Market cap filter:>$2B` },
  { value: 1e10, label: $localize`:Market cap filter:>$10B` },
  { value: 2e11, label: $localize`:Market cap filter:>$200B` },
];

/** `1 report`, `5 reports`. */
export function reportCount(n: number): string {
  return n === 1 ? $localize`${n}:count: report` : $localize`${n}:count: reports`;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Monday–Sunday for the week view, the 42-day Monday-first grid for the month view. */
export function rangeFor(view: CalendarView, anchor: string): DateRange {
  if (view === 'month') return monthGrid(anchor);
  const from = startOfWeek(anchor);
  return { from, to: addDays(from, 6) };
}

/** The anchor one page earlier (-1) or later (+1). */
export function shiftAnchor(view: CalendarView, anchor: string, step: number): string {
  return view === 'month'
    ? addMonths(startOfMonth(anchor), step)
    : addDays(startOfWeek(anchor), 7 * step);
}

export function filtersAreDefault(filters: CalendarFilters): boolean {
  return (
    filters.minMarketCapUsd === DEFAULT_FILTERS.minMarketCapUsd &&
    filters.region === DEFAULT_FILTERS.region &&
    filters.followedOnly === DEFAULT_FILTERS.followedOnly
  );
}

/** Week view: Monday–Friday always, Saturday and Sunday only when they have reports. */
export function visibleWeekDays(days: CalendarDay[]): CalendarDay[] {
  return days.filter((d, i) => i < 5 || d.events.length > 0);
}

const TIME_ORDER: ReportTime[] = ['BMO', 'DMH', 'AMC', 'UNKNOWN'];

/** A day's reports grouped by report time (before open → after close → unknown), each by market cap. */
export function groupByTime(
  events: EarningsEvent[],
): { time: ReportTime; events: EarningsEvent[] }[] {
  return TIME_ORDER.map((time) => ({ time, events: events.filter((e) => e.time === time) })).filter(
    (g) => g.events.length,
  );
}
