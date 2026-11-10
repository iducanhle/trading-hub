import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { ApiService } from '../../core/api/api.service';
import { T212Service } from '../../core/services/t212.service';
import { Change } from '../../shared/components/change/change';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Swipe } from '../../shared/directives/swipe';
import { Icon } from '../../shared/icon/icon';
import { SignedMoneyPipe } from '../../shared/pipes/format.pipes';
import {
  calendarCells,
  calendarWeeks,
  changeInk,
  changeTint,
} from '../../shared/utils/change-calendar';
import {
  WEEKDAYS_SHORT,
  addMonths,
  currentUsSession,
  endOfMonth,
  formatDate,
  formatDateRange,
  formatMonthTitle,
  startOfMonth,
  startOfWeek,
} from '../../shared/utils/dates';
import {
  accountCurrency,
  formatPercent,
  formatSignedMoney,
  formatSignedShort,
  toneClass,
} from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import {
  PnlRow,
  dailyPnl,
  elapsedWeekdays,
  groupPnl,
  sumPnl,
} from './pnl-calendar-model';

type PnlView = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const VIEWS: { value: PnlView; label: string }[] = [
  { value: 'DAILY', label: $localize`Daily` },
  { value: 'WEEKLY', label: $localize`Weekly` },
  { value: 'MONTHLY', label: $localize`Monthly` },
];
const WEEKDAYS = WEEKDAYS_SHORT.slice(0, 5);

/**
 * Portfolio → Overview: the account's profit/loss as a month calendar, like the stock's performance calendar. One
 * square per weekday (or one pill per week, or a year of months) with the change in percent and the amount, tinted
 * by the size of the move; the tapped period, or the whole page, shows in full below. Built from the stored daily
 * account values, so it starts when the history does. Collapses to its title; the choice and view are remembered.
 */
@Component({
  selector: 'app-pnl-calendar',
  imports: [
    Change,
    ErrorState,
    Icon,
    MatIconButton,
    Segment,
    Segmented,
    SignedMoneyPipe,
    Skeleton,
    Swipe,
  ],
  template: `
    <section class="app-card" aria-labelledby="pnl-calendar-title">
      <h2 class="m-0">
        <button
          type="button"
          id="pnl-calendar-title"
          class="-m-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-2xl p-2 text-left hover:bg-surface-container-high"
          [attr.aria-expanded]="expanded()"
          aria-controls="pnl-calendar-content"
          (click)="expanded.set(!expanded())"
        >
          <span
            class="app-title-card flex-1"
            i18n="Card title: the account's profit or loss per day, week or month"
            >Profit/loss calendar</span
          >
          <app-icon
            name="keyboard_arrow_down"
            class="text-on-surface-variant transition-transform duration-200"
            [class.rotate-180]="expanded()"
          />
        </button>
      </h2>
      @if (expanded()) {
        <div id="pnl-calendar-content" class="mt-3">
          <app-segmented
            appearance="chips"
            stretch
            aria-label="Period"
            i18n-aria-label
            [value]="view()"
            (valueChange)="view.set($any($event))"
          >
            @for (v of views; track v.value) {
              <app-segment [value]="v.value">{{ v.label }}</app-segment>
            }
          </app-segmented>

          <div class="mt-2 mb-1 flex items-center justify-between">
            <button
              matIconButton
              type="button"
              aria-label="Previous month"
              i18n-aria-label
              [disabled]="!canGoBack()"
              (click)="shift(-1)"
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
              (click)="shift(1)"
            >
              <app-icon name="chevron_right" />
            </button>
          </div>

          <div appSwipe (swipeLeft)="shift(1)" (swipeRight)="shift(-1)" class="tabular-nums">
            @if (data.error() && !data.hasValue()) {
              <app-error-state compact [error]="data.error()" (retry)="data.reload()" />
            } @else if (!data.hasValue()) {
              <div class="grid grid-cols-5 gap-1" aria-hidden="true">
                @for (i of skeletonCells; track i) {
                  <app-skeleton class="h-[54px] rounded-[10px]" />
                }
              </div>
            } @else if (!days().length) {
              <p class="py-6 text-center text-sm text-on-surface-variant" i18n>
                History is being collected.
              </p>
            } @else if (view() === 'MONTHLY') {
              <div class="grid grid-cols-3 gap-1">
                @for (m of months(); track m.date) {
                  <button
                    type="button"
                    class="relative flex h-[54px] flex-col items-center justify-center rounded-[10px] leading-tight transition-shadow"
                    [style.background]="m.row ? tint(m.row) : null"
                    [style.color]="m.row ? ink(m.row) : 'var(--mat-sys-on-surface-variant)'"
                    [class.bg-surface-container-high]="!m.row"
                    [class.ring-2]="selected() === m.date"
                    [class.ring-primary]="selected() === m.date"
                    [disabled]="!m.row"
                    [attr.aria-label]="m.row ? ariaLabel(m.row) : null"
                    [attr.aria-pressed]="m.row ? selected() === m.date : null"
                    (click)="toggle(m.date)"
                  >
                    <span class="absolute top-0.5 left-1.5 text-[10px] opacity-75">{{
                      m.label
                    }}</span>
                    @if (m.row; as row) {
                      <span class="mt-2.5 text-[13px] font-semibold">{{ percent(row, 2) }}</span>
                      <span class="text-[11px] opacity-80">{{ short(row) }}</span>
                    }
                  </button>
                }
              </div>
            } @else {
              <div class="grid grid-cols-5 gap-1">
                @for (weekday of weekdays; track weekday) {
                  <span class="app-label pb-1.5 text-center text-[11px]">{{ weekday }}</span>
                }
                @if (view() === 'WEEKLY') {
                  <!-- One pill per week: the day numbers stay in their columns; only the days up to today are
                       tinted, with the week's change in the middle of the tint. -->
                  @for (week of weeks(); track $index) {
                    <button
                      type="button"
                      class="relative col-span-5 grid h-[54px] grid-cols-5 gap-1 rounded-[10px] bg-surface-container-high text-xs text-on-surface-variant"
                      [disabled]="!week.row"
                      [attr.aria-label]="week.row ? ariaLabel(week.row) : null"
                      [attr.aria-pressed]="week.row ? selected() === week.row.periodStart : null"
                      (click)="toggle(week.row?.periodStart ?? null)"
                    >
                      @if (week.row; as row) {
                        <span
                          class="absolute inset-y-0 left-0 flex flex-wrap content-center items-baseline justify-center gap-x-2 rounded-[10px] px-1 pt-2.5 leading-tight transition-shadow"
                          [style.width]="tintWidth(week.elapsed)"
                          [style.background]="tint(row)"
                          [style.color]="ink(row)"
                          [class.ring-2]="selected() === row.periodStart"
                          [class.ring-primary]="selected() === row.periodStart"
                        >
                          <span class="text-[13px] font-semibold">{{ percent(row, 2) }}</span>
                          <span class="text-[11px] opacity-80">{{ short(row) }}</span>
                        </span>
                      }
                      @for (cell of week.cells; track $index) {
                        <span class="relative">
                          @if (cell) {
                            <span
                              class="absolute top-0.5 left-1 text-[10px] opacity-75"
                              [style.color]="week.row && $index < week.elapsed ? ink(week.row) : null"
                              >{{ cell.day }}</span
                            >
                          }
                        </span>
                      }
                    </button>
                  }
                } @else {
                  @for (cell of cells(); track $index) {
                    @if (cell) {
                      <button
                        type="button"
                        class="relative flex h-[54px] flex-col items-center justify-center rounded-[10px] leading-tight transition-shadow"
                        [style.background]="cell.row ? tint(cell.row) : null"
                        [style.color]="
                          cell.row ? ink(cell.row) : 'var(--mat-sys-on-surface-variant)'
                        "
                        [class.bg-surface-container-high]="!cell.row"
                        [class.ring-2]="selected() === cell.date"
                        [class.ring-primary]="selected() === cell.date"
                        [disabled]="!cell.row"
                        [attr.aria-label]="dayAriaLabel(cell.date, cell.row)"
                        [attr.aria-pressed]="cell.row ? selected() === cell.date : null"
                        (click)="toggle(cell.date)"
                      >
                        <span class="absolute top-0.5 left-1 text-[10px] opacity-75">{{
                          cell.day
                        }}</span>
                        @if (cell.row; as row) {
                          <span class="mt-2.5 text-xs font-semibold">{{ percent(row, 1) }}</span>
                          <span class="text-[10px] opacity-80">{{ short(row) }}</span>
                        }
                      </button>
                    } @else {
                      <span></span>
                    }
                  }
                }
              </div>
            }
          </div>

          <!-- The tapped period, or the whole month (year) when none is tapped. -->
          <p class="mt-2 mb-0 flex min-h-6 flex-wrap items-center gap-x-2 text-sm tabular-nums">
            @if (shown(); as row) {
              <span class="text-on-surface-variant">{{ label(row) }}</span>
              <span class="font-semibold" [class]="tone(row.pnl)">{{
                row.pnl | money: currency()
              }}</span>
              <app-change [value]="row.pnlPct" />
            }
          </p>
        </div>
      }
    </section>
  `,
})
export class PnlCalendar {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);
  /** From the summary: today's profit/loss since the previous US close, as of now (today's square uses it). */
  readonly todayPnl = input<number | null>(null);
  readonly todayPnlPct = input<number | null>(null);

  protected readonly expanded = persistedSignal('portfolio.pnlCalendar.expanded', true);
  protected readonly view = persistedSignal<PnlView>('portfolio.pnlCalendar.view', 'DAILY');
  protected readonly views = VIEWS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly skeletonCells = Array.from({ length: 20 }, (_, i) => i);

  private readonly currentMonth = startOfMonth(currentUsSession());
  /** First day of the shown month; the monthly view shows its year. */
  protected readonly month = signal(this.currentMonth);
  private readonly pageStart = computed(() =>
    this.view() === 'MONTHLY' ? `${this.month().slice(0, 4)}-01-01` : this.month(),
  );
  private readonly pageEnd = computed(() =>
    this.view() === 'MONTHLY' ? `${this.month().slice(0, 4)}-12-31` : endOfMonth(this.month()),
  );
  protected readonly selected = linkedSignal<string, string | null>({
    source: () => `${this.view()} ${this.month()}`,
    computation: () => null,
  });

  /** Every US session since the history began, as one request (the value at each US close). */
  protected readonly data = rxResource({
    params: () =>
      this.expanded() ? { version: this.version() + this.t212.dataVersion() } : undefined,
    stream: () => this.api.t212History('ALL', 'close'),
  });

  protected readonly currency = computed(() =>
    accountCurrency(this.data.hasValue() ? this.data.value().accountCurrency : null),
  );
  protected readonly days = computed(() =>
    this.data.hasValue()
      ? dailyPnl(this.data.value().points, currentUsSession(), {
          pnl: this.todayPnl(),
          pnlPct: this.todayPnlPct(),
        })
      : [],
  );
  private readonly weekRows = computed(() => groupPnl(this.days(), 'WEEK'));
  private readonly monthRows = computed(() => groupPnl(this.days(), 'MONTH'));

  protected readonly cells = computed(() => calendarCells(this.month(), this.days()));
  /** The month's Monday-to-Friday rows, each with its week's row (null before the history or not reached yet). */
  protected readonly weeks = computed(() => {
    const today = currentUsSession();
    return calendarWeeks(this.month()).map((cells) => {
      const first = cells.find((c) => c !== null)!.date;
      const start = startOfWeek(first);
      return {
        cells,
        row: this.weekRows().find((r) => r.periodStart === start) ?? null,
        elapsed: elapsedWeekdays(start, today),
      };
    });
  });
  /** January to December of the shown year, each with its month's row. */
  protected readonly months = computed(() =>
    Array.from({ length: 12 }, (_, i) => {
      const date = addMonths(this.pageStart(), i);
      const row = this.monthRows().find((r) => r.periodStart === date) ?? null;
      return { date, label: formatDate(date, 'month'), row };
    }),
  );

  protected readonly title = computed(() =>
    this.view() === 'MONTHLY' ? this.pageStart().slice(0, 4) : formatMonthTitle(this.month()),
  );
  private readonly selectedRow = computed(() => {
    const date = this.selected();
    if (!date) return null;
    const rows =
      this.view() === 'MONTHLY'
        ? this.monthRows()
        : this.view() === 'WEEKLY'
          ? this.weekRows()
          : this.days();
    return rows.find((r) => r.periodStart === date) ?? null;
  });
  /** The page's total: the month, or the year in the monthly view. */
  private readonly pageTotal = computed(() =>
    sumPnl(this.pageStart(), this.pageEnd(), this.days()),
  );
  protected readonly shown = computed(() => this.selectedRow() ?? this.pageTotal());

  protected readonly canGoBack = computed(() =>
    this.days().some((d) => d.periodStart < this.pageStart()),
  );
  protected readonly canGoForward = computed(() =>
    this.view() === 'MONTHLY'
      ? this.pageStart().slice(0, 4) < this.currentMonth.slice(0, 4)
      : this.month() < this.currentMonth,
  );

  protected shift(step: number): void {
    if (step < 0 ? !this.canGoBack() : !this.canGoForward()) return;
    this.month.update((month) => addMonths(month, step * (this.view() === 'MONTHLY' ? 12 : 1)));
  }

  /** A second tap on the selected period goes back to the page total. */
  protected toggle(date: string | null): void {
    this.selected.update((selected) => (selected === date ? null : date));
  }

  protected percent(row: PnlRow, digits: number): string {
    return formatPercent(row.pnlPct, digits);
  }

  protected short(row: PnlRow): string {
    return formatSignedShort(row.pnl, this.currency());
  }

  protected tint(row: PnlRow): string {
    return changeTint(row.pnlPct);
  }

  /** The width of the first `days` of the pill's five columns (with their 4 px gaps). */
  protected tintWidth(days: number): string {
    return days >= 5 ? '100%' : `calc((100% - 16px) * ${days} / 5 + ${4 * (days - 1)}px)`;
  }

  protected ink(row: PnlRow): string {
    return changeInk(row.pnlPct);
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** "Fri 6 Nov", "2–6 Nov", "November 2026", or the page title for the page total. */
  protected label(row: PnlRow): string {
    if (row.periodStart === this.pageStart() && row.periodEnd === this.pageEnd()) {
      return this.title();
    }
    if (row.periodStart === row.periodEnd) return formatDate(row.periodStart, 'day');
    if (this.view() === 'WEEKLY') return formatDateRange(row.periodStart, row.periodEnd);
    return formatMonthTitle(row.periodStart);
  }

  protected ariaLabel(row: PnlRow): string {
    return `${this.label(row)}, ${formatPercent(row.pnlPct)}, ${formatSignedMoney(row.pnl, this.currency())}`;
  }

  protected dayAriaLabel(date: string, row: PnlRow | null): string {
    const day = formatDate(date, 'day');
    return row ? this.ariaLabel(row) : $localize`${day}:day:, no data`;
  }
}
