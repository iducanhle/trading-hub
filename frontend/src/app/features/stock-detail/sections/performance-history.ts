import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Subscription } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { HistoryPeriod, HistoryRow } from '../../../core/models/contract';
import { Change } from '../../../shared/components/change/change';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { InView } from '../../../shared/directives/in-view';
import { Swipe } from '../../../shared/directives/swipe';
import { PricePipe } from '../../../shared/pipes/format.pipes';
import { formatDate, formatDateRange } from '../../../shared/utils/dates';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
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
 * Section 5: closes and changes per day, week or month (swipe between the tabs), newest first, with an "E" badge
 * for periods with an earnings report and a "partial" hint for the running period. More rows load on scroll.
 */
@Component({
  selector: 'app-performance-history',
  imports: [MatButton, Section, Change, ErrorState, Skeleton, InView, Swipe, PricePipe],
  template: `
    <app-section title="Performance history" [(expanded)]="expanded">
      <div
        class="mb-2 flex rounded-full bg-surface-container-high p-1"
        role="tablist"
        aria-label="Period"
      >
        @for (p of periods; track p.value) {
          <button
            type="button"
            role="tab"
            class="h-9 flex-1 rounded-full text-sm font-medium transition-colors"
            [class.bg-surface]="period() === p.value"
            [class.shadow-sm]="period() === p.value"
            [class.text-on-surface-variant]="period() !== p.value"
            [attr.aria-selected]="period() === p.value"
            (click)="period.set(p.value)"
          >
            {{ p.label }}
          </button>
        }
      </div>

      <div
        appSwipe
        (swipeLeft)="shift(1)"
        (swipeRight)="shift(-1)"
        role="tabpanel"
        class="min-h-40"
      >
        @if (error() && !rows().length) {
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
          <p class="py-6 text-center text-sm text-on-surface-variant">No price history yet.</p>
        } @else {
          <!-- Its own scroll area (about 10 rows), so loading more never pushes the sections below out of reach. -->
          <div class="max-h-[28rem] overflow-y-auto rounded-xl" tabindex="0" aria-label="Rows">
            <ul class="divide-y divide-outline-variant/60 tabular-nums">
              @for (row of rows(); track row.periodStart) {
                <li class="flex min-h-11 items-center gap-2 py-1.5 text-sm">
                  <span class="min-w-0 flex-1 truncate">{{ label(row) }}</span>
                  @if (row.hasEarnings) {
                    <span
                      class="flex size-5 items-center justify-center rounded-full bg-primary-container text-[10px] font-bold text-on-primary-container"
                      title="Earnings report in this period"
                      aria-label="Earnings report"
                      >E</span
                    >
                  }
                  @if (row.partial) {
                    <span class="text-xs text-on-surface-variant italic">partial</span>
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
                    {{ loading() ? 'Loading…' : 'Load more' }}
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    </app-section>
  `,
})
export class PerformanceHistory {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  protected readonly periods = PERIODS;
  protected readonly expanded = persistedSignal('et.section.history', true);
  protected readonly period = signal<HistoryPeriod>('DAILY');
  protected readonly rows = signal<HistoryRow[]>([]);
  protected readonly nextBefore = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly currency = signal<string | null>(null);

  private request?: Subscription;
  private force = false;

  constructor() {
    // A new symbol, period or refresh starts over from the newest rows.
    effect(() => {
      const symbol = this.ctx.symbol();
      this.period();
      const version = this.ctx.version();
      const expanded = this.expanded();
      untracked(() => {
        this.request?.unsubscribe();
        this.rows.set([]);
        this.nextBefore.set(null);
        this.error.set(null);
        this.force = version > 0;
        if (symbol && expanded) this.load(null);
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
    return periodLabel(row, this.period());
  }

  protected shift(step: number): void {
    const index = PERIODS.findIndex((p) => p.value === this.period());
    const next = PERIODS[index + step];
    if (next) this.period.set(next.value);
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
      .history(this.ctx.symbol(), this.period(), before, PAGE_SIZE, { force: this.force })
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
