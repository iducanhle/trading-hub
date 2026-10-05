import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Subscription } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { HistoryPeriod, HistoryRow } from '../../../core/models/contract';
import { Change } from '../../../shared/components/change/change';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { InView } from '../../../shared/directives/in-view';
import { Swipe } from '../../../shared/directives/swipe';
import { PricePipe } from '../../../shared/pipes/format.pipes';
import { formatDate, formatDateRange } from '../../../shared/utils/dates';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';
import { HistoryCalendar } from './history-calendar';
import { Segment, Segmented } from '../../../shared/components/segmented/segmented';

type HistoryView = HistoryPeriod | 'CALENDAR';

const PERIODS: { value: HistoryView; label: string }[] = [
  { value: 'CALENDAR', label: $localize`Daily` },
  { value: 'WEEKLY', label: $localize`Weekly` },
  { value: 'MONTHLY', label: $localize`Monthly` },
];
const PAGE_SIZE = 30;

/** "Fri 25 Sep", "22–26 Sep", "Sep 2026". */
export function periodLabel(row: HistoryRow, period: HistoryPeriod): string {
  switch (period) {
    case 'DAILY':
      return formatDate(row.periodStart, 'day');
    case 'WEEKLY':
      return formatDateRange(row.periodStart, row.periodEnd);
    case 'MONTHLY':
      return formatDate(row.periodStart, 'monthYear');
  }
}

/**
 * Section 5: a month calendar of daily changes, a month of weekly changes as one pill per week, a year of monthly
 * changes as one pill per month, then closes and changes per day, newest first,
 * with an "E" badge for periods with an earnings report and a "partial" hint for the running period (more rows load
 * on scroll). Swipe between the tabs.
 */
@Component({
  selector: 'app-performance-history',
  imports: [
    Segmented,
    Segment,
    MatButton,
    HistoryCalendar,
    Change,
    ErrorState,
    Skeleton,
    InView,
    Swipe,
    PricePipe,
  ],
  template: `
    <!-- One card: the period switch is its header, split from the content by a hairline. -->
    <div class="app-card mx-4 overflow-hidden">
      <div class="border-b border-outline-variant/60 p-2">
        <app-segmented
          appearance="chips"
          stretch
          aria-label="Period"
          i18n-aria-label
          [value]="view()"
          (valueChange)="view.set($event)"
        >
          @for (p of periods; track p.value) {
            <app-segment [value]="p.value">{{ p.label }}</app-segment>
          }
        </app-segmented>
      </div>

      <div
        appSwipe
        (swipeLeft)="shift(1)"
        (swipeRight)="shift(-1)"
        class="min-h-40 px-1.5"
      >
        @if (view() === 'CALENDAR') {
          <app-history-calendar [currency]="currency()" />
        } @else if (view() === 'WEEKLY') {
          <app-history-calendar period="WEEKLY" [currency]="currency()" />
        } @else if (view() === 'MONTHLY') {
          <app-history-calendar period="MONTHLY" [currency]="currency()" />
        } @else if (error() && !rows().length) {
          <app-error-state compact [error]="error()" (retry)="loadMore()" />
        } @else if (!rows().length && loading()) {
          <ul aria-hidden="true">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <li class="flex h-11 items-center justify-between">
                <app-skeleton class="h-4 w-24" /><app-skeleton class="h-4 w-28" />
              </li>
            }
          </ul>
        } @else if (!rows().length) {
          <p class="py-6 text-center text-sm text-on-surface-variant" i18n>No price history yet.</p>
        } @else {
          <!-- Its own scroll area (about 10 rows), so loading more never pushes the sections below out of reach. -->
          <div
            class="max-h-[28rem] overflow-y-auto rounded-xl"
            tabindex="0"
            aria-label="Rows"
            i18n-aria-label="Table rows"
          >
            <ul class="divide-y divide-outline-variant/60 tabular-nums">
              @for (row of rows(); track row.periodStart) {
                <li class="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ label(row) }}</span>
                  @if (row.hasEarnings) {
                    <span
                      class="flex size-5 items-center justify-center rounded-full bg-primary-container text-[10px] font-bold text-on-primary-container"
                      title="Earnings report in this period"
                      i18n-title
                      aria-label="Earnings report"
                      i18n-aria-label
                      >E</span
                    >
                  }
                  @if (row.partial) {
                    <span
                      class="text-xs text-on-surface-variant italic"
                      i18n="The period is still running"
                      >partial</span
                    >
                  }
                  <span class="w-24 text-right">{{ row.close | price: currency() }}</span>
                  <app-change class="w-20 text-right" [value]="row.changePercent" />
                </li>
              }
            </ul>
            @if (nextBefore()) {
              <div appInView (inView)="loadMore()" class="flex justify-center pt-2">
                @if (error()) {
                  <app-error-state compact [error]="error()" (retry)="loadMore()" />
                } @else {
                  <button matButton type="button" [disabled]="loading()" (click)="loadMore()">
                    @if (loading()) {
                      <ng-container i18n>Loading…</ng-container>
                    } @else {
                      <ng-container i18n>Load more</ng-container>
                    }
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class PerformanceHistory {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  protected readonly periods = PERIODS;
  protected readonly view = persistedSignal<HistoryView>('et.history.view', 'CALENDAR');
  /** The list's period (only the daily list is left); null on the calendars, which load their own pages. */
  protected readonly period = computed(() =>
    this.view() === 'DAILY' ? ('DAILY' as HistoryPeriod) : null,
  );
  protected readonly rows = signal<HistoryRow[]>([]);
  protected readonly nextBefore = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly currency = signal<string | null>(null);

  private request?: Subscription;
  private force = false;

  constructor() {
    // The daily list is hidden; a view saved before then opens the daily calendar.
    if (this.view() === 'DAILY') this.view.set('CALENDAR');
    // A new symbol, period or refresh starts over from the newest rows.
    effect(() => {
      const symbol = this.ctx.symbol();
      const period = this.period();
      const version = this.ctx.version();
      untracked(() => {
        this.request?.unsubscribe();
        this.rows.set([]);
        this.nextBefore.set(null);
        this.error.set(null);
        this.force = version > 0;
        if (symbol && period) this.load(null);
      });
    });
    // The overview is cached, so this reads the currency without another request.
    effect((onCleanup) => {
      const symbol = this.ctx.symbol();
      if (!symbol) return;
      const sub = this.api
        .overview(symbol)
        .subscribe({ next: (o) => this.currency.set(o.currency), error: () => undefined });
      onCleanup(() => sub.unsubscribe());
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected label(row: HistoryRow): string {
    return periodLabel(row, this.period() ?? 'DAILY');
  }

  protected shift(step: number): void {
    const index = PERIODS.findIndex((p) => p.value === this.view());
    const next = PERIODS[index + step];
    if (next) this.view.set(next.value);
  }

  protected loadMore(): void {
    if (this.loading()) return;
    if (this.rows().length && !this.nextBefore()) return;
    this.load(this.nextBefore());
  }

  private load(before: string | null): void {
    this.loading.set(true);
    this.error.set(null);
    this.request = this.api
      .history(this.ctx.symbol(), this.period() ?? 'DAILY', before, PAGE_SIZE, {
        force: this.force,
      })
      .subscribe({
        next: (page) => {
          this.rows.update((rows) => [...rows, ...page.rows]);
          this.nextBefore.set(page.nextBefore);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error);
          this.loading.set(false);
        },
      });
  }
}
