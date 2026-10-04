import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { map, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { Icon } from '../../shared/icon/icon';
import { AppDatePipe } from '../../shared/pipes/format.pipes';
import { T212Side } from '../../core/models/contract';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { DEFAULT_VIEW, applyView, buildTimeline } from './instrument-filters';
import { PortfolioPeriod, dayIn, isAllTime, periodQuery } from './portfolio-model';
import { PositionHeader, PositionSummary } from './position-summary';
import { TimelineList } from './timeline-list';

export interface PositionDialogData {
  t212Ticker: string;
  /** The period chosen on the portfolio page; all time when unset. */
  period?: PortfolioPeriod;
  /** As the Stocks tab's "With unrealized" switch; true when unset. */
  includeUnrealized?: boolean;
}

/**
 * Opened from a position on the Overview, or a row on the Stocks, Trades or Dividends tab: the position and its
 * profit/loss in the period chosen on the portfolio page (all time from the Overview), then the trades and dividends
 * of that period, collapsed. The header links to the stock page.
 */
@Component({
  selector: 'app-position-dialog',
  imports: [
    MatIconButton,
    ErrorState,
    Skeleton,
    StaleChip,
    Icon,
    PositionHeader,
    PositionSummary,
    TimelineList,
    Segmented,
    Segment,
    AppDatePipe,
  ],
  template: `
    <div class="max-h-[90dvh] overflow-y-auto p-4">
      @if (detail.error() && !detail.hasValue()) {
        <app-error-state [error]="detail.error()" (retry)="detail.reload()" />
      } @else if (!detail.hasValue()) {
        <app-skeleton shape="card" class="block h-12" />
        <app-skeleton shape="card" class="mt-3 block h-56" />
      } @else {
        @let d = detail.value();
        @let i = d.instrument;
        <app-position-header [instrument]="i" linked (opened)="close()">
          <button matIconButton type="button" aria-label="Close" i18n-aria-label (click)="close()">
            <app-icon name="close" />
          </button>
        </app-position-header>
        @if (d.stale) {
          <div class="mt-2"><app-stale-chip [asOf]="d.asOf" /></div>
        }

        @if (periodItem.error() && !periodItem.hasValue()) {
          <app-error-state
            class="mt-4 block"
            [error]="periodItem.error()"
            (retry)="periodItem.reload()"
          />
        } @else if (!periodItem.hasValue()) {
          <app-skeleton shape="card" class="mt-4 block h-40" />
        } @else {
          @let shown = periodItem.value() ?? i;
          <p class="mt-4 mb-2 px-1 text-[13px] font-semibold text-on-surface-variant">
            @if (periodItem.value() && data.period; as period) {
              <ng-container i18n="Followed by a date range">Period</ng-container>
              {{ period.from | appDate }} – {{ period.to | appDate }}
            } @else {
              <ng-container i18n="Period without limits">All time</ng-container>
            }
          </p>
          <app-position-summary
            [instrument]="shown"
            [currency]="d.accountCurrency"
            [includeUnrealized]="data.includeUnrealized ?? true"
          />
        }

        <button
          type="button"
          class="mt-4 flex w-full items-center gap-2 rounded-2xl px-1 py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          [attr.aria-expanded]="tradesOpen()"
          aria-controls="position-trades"
          (click)="tradesOpen.set(!tradesOpen())"
        >
          <span class="flex-1 text-[15px] font-bold">
            <ng-container i18n>Trades and dividends</ng-container> ({{ timeline().length }})
          </span>
          <app-icon
            name="keyboard_arrow_down"
            class="text-on-surface-variant transition-transform"
            [class.rotate-180]="tradesOpen()"
          />
        </button>
        @if (tradesOpen()) {
          <div id="position-trades" class="mt-2">
            @if (timeline().length === 0) {
              <p class="app-card text-sm text-on-surface-variant" i18n>
                No trades or dividends in this period.
              </p>
            } @else {
              <app-segmented
                class="mb-3"
                stretch
                aria-label="Trade side"
                i18n-aria-label
                [value]="side() ?? 'ALL'"
                (valueChange)="setSide($event)"
              >
                <app-segment value="ALL" i18n="All trades">All</app-segment>
                <app-segment value="BUY" i18n="Trade direction|Kind of trade">Buy</app-segment>
                <app-segment value="SELL" i18n="Trade direction|Kind of trade">Sell</app-segment>
              </app-segmented>
              <app-timeline-list [items]="visible()" [currency]="d.accountCurrency" />
            }
          </div>
        }
      }
    </div>
  `,
})
export class PositionDialog {
  private readonly api = inject(ApiService);
  private readonly ref = inject(MatDialogRef<PositionDialog>);
  protected readonly data = inject<PositionDialogData>(MAT_DIALOG_DATA);

  protected readonly tradesOpen = signal(false);

  protected readonly detail = rxResource({
    params: () => this.data.t212Ticker,
    stream: ({ params }) => this.api.t212Instrument(params),
  });

  /**
   * The instrument within the period chosen on the portfolio page, as in the Stocks list; null for all time or when
   * it had no activity in the period (then the all-time figures are shown).
   */
  protected readonly periodItem = rxResource({
    params: () => ({ period: this.data.period ?? null }),
    stream: ({ params }) =>
      !params.period || isAllTime(params.period)
        ? of(null)
        : this.api
            .t212Instruments({ ...periodQuery(params.period), status: 'ALL' })
            .pipe(map((r) => r.items.find((x) => x.t212Ticker === this.data.t212Ticker) ?? null)),
  });

  /** Trades and dividends inside the period (its days are inclusive, in the device time zone), newest first. */
  protected readonly timeline = computed(() => {
    if (!this.detail.hasValue()) return [];
    const { trades, dividends } = this.detail.value();
    const from = this.data.period?.from ?? null;
    const to = this.data.period?.to ?? null;
    return buildTimeline(trades, dividends).filter((item) => {
      const day = dayIn(item.at);
      return (!from || day >= from) && (!to || day <= to);
    });
  });

  /** Buy or sell only; dividends are hidden while set, as on the Trades tab. */
  protected readonly side = signal<T212Side | null>(null);

  protected readonly visible = computed(() =>
    applyView(this.timeline(), { ...DEFAULT_VIEW, side: this.side() }),
  );

  protected setSide(value: string): void {
    this.side.set(value === 'BUY' || value === 'SELL' ? value : null);
  }

  protected close(): void {
    this.ref.close();
  }
}
