import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { ApiService } from '../../../core/api/api.service';
import { HistoryPeriod, HistoryRow } from '../../../core/models/contract';
import { Change } from '../../../shared/components/change/change';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { Icon } from '../../../shared/icon/icon';
import { PricePipe } from '../../../shared/pipes/format.pipes';
import {
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  endOfMonth,
  formatDate,
  formatDateRange,
  formatMonthTitle,
  isWeekend,
  startOfMonth,
  todayIso,
  weekdayIndex,
} from '../../../shared/utils/dates';
import { formatPercent } from '../../../shared/utils/format';
import { StockContext } from '../stock-context';

/** More than the weekdays of any month, so one request covers a whole month. */
const MONTH_LIMIT = 23;
/** More than the weeks touching any month. */
const WEEK_LIMIT = 6;
const WEEKDAYS = WEEKDAYS_SHORT.slice(0, 5);

export interface CalendarCell {
  date: string;
  day: number;
  /** Null on a weekday without a session (a holiday) or not traded yet. */
  row: HistoryRow | null;
}

/**
 * The weekdays of a month in Monday-to-Friday columns, with null blanks before the first one; each carries its
 * daily row when there is one.
 */
export function calendarCells(month: string, rows: readonly HistoryRow[]): (CalendarCell | null)[] {
  const byDate = new Map(rows.map((row) => [row.periodStart, row]));
  const cells: (CalendarCell | null)[] = [];
  const last = endOfMonth(month);
  for (let date = startOfMonth(month); date <= last; date = addDays(date, 1)) {
    if (isWeekend(date)) continue;
    if (!cells.length) cells.push(...Array<null>(weekdayIndex(date)).fill(null));
    cells.push({ date, day: Number(date.slice(8)), row: byDate.get(date) ?? null });
  }
  return cells;
}

/** How strongly a day's square is tinted: 0 (no change or no data) to 4 (a move of 5 % or more). */
export function intensity(percent: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (percent == null || !Number.isFinite(percent) || percent === 0) return 0;
  const size = Math.abs(percent);
  return size < 1 ? 1 : size < 2.5 ? 2 : size < 5 ? 3 : 4;
}

const MIX = [0, 14, 26, 42, 80];

/**
 * Performance history as a month calendar: one square per trading day with its change (or, weekly, one pill per week
 * touching the month), tinted green or red by the size of the move, an "E" on earnings periods, and the close of the
 * tapped period below.
 */
@Component({
  selector: 'app-history-calendar',
  imports: [MatIconButton, Icon, Change, ErrorState, Skeleton, PricePipe],
  template: `
    <div class="mb-2 flex items-center justify-between">
      <button
        matIconButton
        type="button"
        aria-label="Previous month"
        i18n-aria-label
        [disabled]="!canGoBack()"
        (click)="shiftMonth(-1)"
      >
        <app-icon name="chevron_left" />
      </button>
      <h3 class="app-title-card" aria-live="polite">{{ title() }}</h3>
      <button
        matIconButton
        type="button"
        aria-label="Next month"
        i18n-aria-label
        [disabled]="!canGoForward()"
        (click)="shiftMonth(1)"
      >
        <app-icon name="chevron_right" />
      </button>
    </div>

    @if (period() === 'WEEKLY') {
      <div class="grid grid-cols-5 gap-1 tabular-nums">
        @for (weekday of weekdays; track weekday) {
          <span class="app-label pb-1.5 text-center text-[11px]">{{ weekday }}</span>
        }
        @if (page.error()) {
          <div class="col-span-5">
            <app-error-state compact [error]="page.error()" (retry)="page.reload()" />
          </div>
        } @else if (!page.hasValue()) {
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <app-skeleton class="col-span-5 h-[46px] rounded-[10px]" />
          }
        } @else {
          <!-- One pill per week: the day numbers stay in their weekday columns, the week's change sits in the middle. -->
          @for (week of weeks(); track $index) {
            <button
              type="button"
              class="relative col-span-5 grid h-[46px] grid-cols-5 gap-1 rounded-[10px] text-xs transition-shadow"
              [style.background]="week.row ? tint(week.row) : null"
              [style.color]="week.row ? ink(week.row) : 'var(--mat-sys-on-surface-variant)'"
              [class.bg-surface-container-high]="!week.row"
              [class.ring-2]="week.row && selected() === week.row.periodStart"
              [class.ring-primary]="week.row && selected() === week.row.periodStart"
              [disabled]="!week.row"
              [attr.aria-label]="week.row ? rowAriaLabel(week.row) : null"
              [attr.aria-pressed]="week.row ? selected() === week.row.periodStart : null"
              (click)="selected.set(week.row?.periodStart ?? null)"
            >
              @for (cell of week.cells; track $index) {
                <span class="relative">
                  @if (cell) {
                    <span class="absolute top-0.5 left-1 text-[10px] opacity-75">{{
                      cell.day
                    }}</span>
                  }
                </span>
              }
              @if (week.row; as row) {
                @if (row.hasEarnings) {
                  <span class="absolute top-0.5 right-1 text-[10px] font-bold">E</span>
                }
                <span
                  class="absolute inset-x-0 bottom-0 top-2 flex items-center justify-center text-sm font-semibold"
                  >{{ percentOf(row) }}</span
                >
              }
            </button>
          }
        }
      </div>
    } @else {
      <div class="grid grid-cols-5 gap-1 tabular-nums">
        @for (weekday of weekdays; track weekday) {
          <span class="app-label pb-1.5 text-center text-[11px]">{{ weekday }}</span>
        }
        @if (page.error()) {
          <div class="col-span-5">
            <app-error-state compact [error]="page.error()" (retry)="page.reload()" />
          </div>
        } @else if (!page.hasValue()) {
          @for (i of skeletonCells; track i) {
            <app-skeleton class="h-[46px] rounded-[10px]" />
          }
        } @else {
          @for (cell of cells(); track $index) {
            @if (cell) {
              <button
                type="button"
                class="relative flex h-[46px] flex-col items-center justify-center rounded-[10px] text-xs transition-shadow"
                [style.background]="background(cell)"
                [style.color]="foreground(cell)"
                [class.ring-2]="selected() === cell.date"
                [class.ring-primary]="selected() === cell.date"
                [class.bg-surface-container-high]="!cell.row"
                [disabled]="!cell.row"
                [attr.aria-label]="ariaLabel(cell)"
                [attr.aria-pressed]="selected() === cell.date"
                (click)="selected.set(cell.date)"
              >
                <span class="absolute top-0.5 left-1 text-[10px] opacity-75">{{ cell.day }}</span>
                @if (cell.row?.hasEarnings) {
                  <span class="absolute top-0.5 right-1 text-[10px] font-bold">E</span>
                }
                @if (cell.row) {
                  <span class="mt-2 font-semibold">{{ percent(cell) }}</span>
                }
              </button>
            } @else {
              <span></span>
            }
          }
        }
      </div>
    }

    <p class="mt-2 flex min-h-6 items-center gap-2 text-sm tabular-nums">
      @if (selectedRow(); as row) {
        <span class="text-on-surface-variant">{{ rowLabel(row) }}</span>
        <span class="font-medium">{{ row.close | price: currency() }}</span>
        <app-change [value]="row.changePercent" />
        @if (row.hasEarnings) {
          <span class="text-xs text-on-surface-variant" i18n>· Earnings</span>
        }
        @if (row.partial) {
          <span class="text-xs text-on-surface-variant italic" i18n="The period is still running"
            >partial</span
          >
        }
      } @else if (page.hasValue() && period() === 'WEEKLY') {
        <span class="text-xs text-on-surface-variant" i18n>Tap a week to see its close.</span>
      } @else if (page.hasValue()) {
        <span class="text-xs text-on-surface-variant" i18n>Tap a day to see its close.</span>
      }
    </p>
  `,
})
export class HistoryCalendar {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  readonly currency = input<string | null>(null);
  /** Daily squares or weekly pills. */
  readonly period = input<Extract<HistoryPeriod, 'DAILY' | 'WEEKLY'>>('DAILY');

  protected readonly weekdays = WEEKDAYS;
  protected readonly skeletonCells = Array.from({ length: 20 }, (_, i) => i);
  private readonly currentMonth = startOfMonth(todayIso());
  /** First day of the shown month; back to the current month for another stock. */
  protected readonly month = linkedSignal({
    source: this.ctx.symbol,
    computation: () => this.currentMonth,
  });
  protected readonly selected = linkedSignal<string, string | null>({
    source: () => `${this.period()} ${this.month()}`,
    computation: () => null,
  });

  protected readonly page = rxResource({
    params: () =>
      this.ctx.symbol()
        ? {
            symbol: this.ctx.symbol(),
            month: this.month(),
            period: this.period(),
            version: this.ctx.version(),
          }
        : undefined,
    stream: ({ params }) =>
      this.api.history(
        params.symbol,
        params.period,
        addMonths(params.month, 1),
        params.period === 'WEEKLY' ? WEEK_LIMIT : MONTH_LIMIT,
        { force: params.version > 0 },
      ),
  });

  /** The month's days, or the weeks touching it (oldest first, like the calendar). */
  protected readonly rows = computed(() => {
    if (!this.page.hasValue()) return [];
    const rows = this.page.value().rows;
    if (this.period() === 'DAILY') {
      const prefix = this.month().slice(0, 7);
      return rows.filter((r) => r.periodStart.startsWith(prefix));
    }
    const first = this.month();
    const last = endOfMonth(first);
    return rows
      .filter((r) => r.periodStart <= last && r.periodEnd >= first)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  });
  protected readonly cells = computed(() => calendarCells(this.month(), this.rows()));
  /** The calendar's Monday-to-Friday rows, each with the weekly row covering it (null when not traded yet). */
  protected readonly weeks = computed(() => {
    const cells = calendarCells(this.month(), []);
    const weeks: { cells: (CalendarCell | null)[]; row: HistoryRow | null }[] = [];
    for (let i = 0; i < cells.length; i += 5) {
      const week = cells.slice(i, i + 5);
      while (week.length < 5) week.push(null);
      const dates = week.filter((c) => c !== null).map((c) => c.date);
      const row =
        this.rows().find((r) => dates.some((d) => d >= r.periodStart && d <= r.periodEnd)) ?? null;
      weeks.push({ cells: week, row });
    }
    return weeks;
  });
  protected readonly title = computed(() => formatMonthTitle(this.month()));
  protected readonly selectedRow = computed(
    () => this.rows().find((row) => row.periodStart === this.selected()) ?? null,
  );
  /** Older data exists: the page has rows before this month or more pages. */
  protected readonly canGoBack = computed(() => {
    if (!this.page.hasValue()) return false;
    const page = this.page.value();
    return page.nextBefore !== null || page.rows.some((row) => row.periodStart < this.month());
  });
  protected readonly canGoForward = computed(() => this.month() < this.currentMonth);

  protected shiftMonth(step: number): void {
    this.month.update((month) => addMonths(month, step));
  }

  protected percent(cell: CalendarCell): string {
    return formatPercent(cell.row?.changePercent, 1);
  }

  protected percentOf(row: HistoryRow): string {
    return formatPercent(row.changePercent, 2);
  }

  protected background(cell: CalendarCell): string | null {
    return cell.row ? this.tint(cell.row) : null;
  }

  protected foreground(cell: CalendarCell): string | null {
    return cell.row ? this.ink(cell.row) : 'var(--mat-sys-on-surface-variant)';
  }

  protected tint(row: HistoryRow): string {
    const change = row.changePercent;
    const level = intensity(change);
    if (!level) return 'var(--mat-sys-surface-container-high)';
    const tone = change! > 0 ? 'var(--app-gain)' : 'var(--app-loss)';
    return `color-mix(in oklab, ${tone} ${MIX[level]}%, var(--mat-sys-surface))`;
  }

  /** The strongest tint takes the surface colour as text (white in light mode, dark in dark mode) for contrast. */
  protected ink(row: HistoryRow): string {
    return intensity(row.changePercent) === 4
      ? 'var(--mat-sys-surface)'
      : 'var(--mat-sys-on-surface)';
  }

  protected rowLabel(row: HistoryRow): string {
    return this.period() === 'WEEKLY'
      ? formatDateRange(row.periodStart, row.periodEnd)
      : formatDate(row.periodStart, 'day');
  }

  protected rowAriaLabel(row: HistoryRow): string {
    const range = this.rowLabel(row);
    const change = formatPercent(row.changePercent);
    return row.hasEarnings
      ? $localize`${range}:day:, ${change}:change:, earnings`
      : `${range}, ${change}`;
  }

  protected ariaLabel(cell: CalendarCell): string {
    const day = formatDate(cell.date, 'day');
    if (!cell.row) return $localize`${day}:day:, no trading`;
    const change = formatPercent(cell.row.changePercent);
    return cell.row.hasEarnings
      ? $localize`${day}:day:, ${change}:change:, earnings`
      : `${day}, ${change}`;
  }
}
