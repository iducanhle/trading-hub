import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { ApiService } from '../../../core/api/api.service';
import { HistoryRow } from '../../../core/models/contract';
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
 * Performance history as a month calendar: one square per trading day with its change, tinted green or red by the
 * size of the move, an "E" on earnings days, and the close of the tapped day below.
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
      <h3 class="text-sm font-medium" aria-live="polite">{{ title() }}</h3>
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

    <div class="grid grid-cols-5 gap-1 tabular-nums">
      @for (weekday of weekdays; track weekday) {
        <span class="pb-1 text-center text-xs text-on-surface-variant">{{ weekday }}</span>
      }
      @if (page.error()) {
        <div class="col-span-5">
          <app-error-state compact [error]="page.error()" (retry)="page.reload()" />
        </div>
      } @else if (!page.hasValue()) {
        @for (i of skeletonCells; track i) {
          <app-skeleton class="h-12 rounded-lg" />
        }
      } @else {
        @for (cell of cells(); track $index) {
          @if (cell) {
            <button
              type="button"
              class="relative flex h-12 flex-col items-center justify-center rounded-lg text-xs transition-shadow"
              [style.background]="background(cell)"
              [style.color]="foreground(cell)"
              [class.ring-2]="selected() === cell.date"
              [class.ring-primary]="selected() === cell.date"
              [class.bg-surface-container]="!cell.row"
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

    <p class="mt-2 flex min-h-6 items-center gap-2 text-sm tabular-nums">
      @if (selectedRow(); as row) {
        <span class="text-on-surface-variant">{{ dayLabel(row.periodStart) }}</span>
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

  protected readonly weekdays = WEEKDAYS;
  protected readonly skeletonCells = Array.from({ length: 20 }, (_, i) => i);
  private readonly currentMonth = startOfMonth(todayIso());
  /** First day of the shown month; back to the current month for another stock. */
  protected readonly month = linkedSignal({
    source: this.ctx.symbol,
    computation: () => this.currentMonth,
  });
  protected readonly selected = linkedSignal<string, string | null>({
    source: this.month,
    computation: () => null,
  });

  protected readonly page = rxResource({
    params: () =>
      this.ctx.symbol()
        ? { symbol: this.ctx.symbol(), month: this.month(), version: this.ctx.version() }
        : undefined,
    stream: ({ params }) =>
      this.api.history(params.symbol, 'DAILY', addMonths(params.month, 1), MONTH_LIMIT, {
        force: params.version > 0,
      }),
  });

  private readonly rows = computed(() => {
    const prefix = this.month().slice(0, 7);
    return this.page.hasValue()
      ? this.page.value().rows.filter((r) => r.periodStart.startsWith(prefix))
      : [];
  });
  protected readonly cells = computed(() => calendarCells(this.month(), this.rows()));
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

  protected background(cell: CalendarCell): string | null {
    const change = cell.row?.changePercent;
    const level = intensity(change);
    if (!cell.row) return null;
    if (!level) return 'var(--mat-sys-surface-container-high)';
    const tone = change! > 0 ? 'var(--app-gain)' : 'var(--app-loss)';
    return `color-mix(in oklab, ${tone} ${MIX[level]}%, var(--mat-sys-surface))`;
  }

  /** The strongest tint takes the surface colour as text (white in light mode, dark in dark mode) for contrast. */
  protected foreground(cell: CalendarCell): string | null {
    if (!cell.row) return 'var(--mat-sys-on-surface-variant)';
    return intensity(cell.row.changePercent) === 4
      ? 'var(--mat-sys-surface)'
      : 'var(--mat-sys-on-surface)';
  }

  protected ariaLabel(cell: CalendarCell): string {
    const day = formatDate(cell.date, 'day');
    if (!cell.row) return $localize`${day}:day:, no trading`;
    const change = formatPercent(cell.row.changePercent);
    return cell.row.hasEarnings
      ? $localize`${day}:day:, ${change}:change:, earnings`
      : `${day}, ${change}`;
  }

  protected dayLabel(date: string): string {
    return formatDate(date, 'day');
  }
}
