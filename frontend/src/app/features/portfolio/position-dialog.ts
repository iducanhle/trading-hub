import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { PriceRange } from '../../core/models/contract';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import { PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { PERIOD_LABELS } from '../../shared/utils/format';
import { Pnl } from './pnl';
import { displayTicker } from './portfolio-model';
import { PositionChart } from './position-chart';
import { majorCurrency } from '../stock-detail/sections/price-chart/position-lines';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

export interface PositionDialogData {
  t212Ticker: string;
}

const RANGES: PriceRange[] = ['1D', '1W', '1M', '2M', '3M', '6M', '1Y', '3Y', '5Y'];

/**
 * Opened from a position on the Overview or the Stocks tab: price chart with the average price paid and the current price,
 * then the position and its profit/loss (all time). Links to the full position and the stock page.
 */
@Component({
  selector: 'app-position-dialog',
  imports: [
    Segmented,
    Segment,
    RouterLink,
    MatButton,
    MatIconButton,
    ErrorState,
    Skeleton,
    StaleChip,
    StockLogo,
    TermInfo,
    Icon,
    PricePipe,
    QuantityPipe,
    Pnl,
    PositionChart,
  ],
  template: `
    <div class="max-h-[90dvh] overflow-y-auto p-4">
      @if (detail.error() && !detail.hasValue()) {
        <app-error-state [error]="detail.error()" (retry)="detail.reload()" />
      } @else if (!detail.hasValue()) {
        <app-skeleton shape="card" class="block h-12" />
        <app-skeleton shape="card" class="mt-3 block h-56" />
        <app-skeleton shape="card" class="mt-3 block h-40" />
      } @else {
        @let d = detail.value();
        @let i = d.instrument;
        <div class="flex items-center gap-3">
          <app-stock-logo [symbol]="ticker()" [logoUrl]="i.logoUrl" [size]="44" />
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-lg font-bold">{{ i.name }}</h2>
            <p class="text-sm text-on-surface-variant">
              {{ ticker() }} · {{ i.currentPrice | price: i.instrumentCurrency }}
            </p>
          </div>
          <button matIconButton type="button" aria-label="Close" i18n-aria-label (click)="close()">
            <app-icon name="close" />
          </button>
        </div>
        @if (d.stale) {
          <div class="mt-2"><app-stale-chip [asOf]="d.asOf" /></div>
        }

        @if (i.symbol) {
          <div class="mt-3">
            @if (prices.error() && !prices.hasValue()) {
              <app-error-state [error]="prices.error()" (retry)="prices.reload()" />
            } @else if (!prices.value()) {
              <app-skeleton shape="card" class="block h-56" />
            } @else {
              @let p = prices.value()!;
              <app-position-chart
                [bars]="chartBars()"
                [averagePrice]="sameCurrency() ? i.averageCost : null"
                [currentPrice]="sameCurrency() ? i.currentPrice : null"
                [label]="chartLabel()"
              />
              @if (!sameCurrency()) {
                <p class="mt-1 text-xs text-on-surface-variant" i18n>
                  The chart is in {{ chartCurrency() }} and the position in
                  {{ i.instrumentCurrency }}, so the price lines are not shown.
                </p>
              }
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <app-segmented
                  appearance="chips"
                  aria-label="Chart range"
                  i18n-aria-label
                  [value]="range()"
                  (valueChange)="range.set($event)"
                >
                  @for (r of ranges; track r) {
                    <app-segment [value]="r">{{ rangeLabels[r] }}</app-segment>
                  }
                </app-segmented>
                @if (p.stale) {
                  <app-stale-chip [asOf]="p.asOf" />
                }
              </div>
              <p class="mt-2 flex flex-wrap gap-x-4 text-xs text-on-surface-variant">
                <span class="inline-flex items-center gap-1">
                  <span class="inline-block w-4 border-t-2 border-dashed border-current"></span>
                  <ng-container i18n>Average cost</ng-container>
                </span>
                <span class="inline-flex items-center gap-1">
                  <span class="inline-block w-4 border-t-2 border-current"></span>
                  <ng-container i18n>Current price</ng-container>
                </span>
              </p>
            }
          </div>
        }

        <div class="app-card mt-4">
          <p class="app-label flex items-center gap-1">
            <ng-container i18n>Total profit/loss</ng-container><app-term-info term="totalPnl" />
          </p>
          <app-pnl
            strong
            class="mt-1 text-xl"
            [value]="i.totalPnl"
            [currency]="d.accountCurrency"
            [pct]="i.totalPnlPct"
          />
          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] font-semibold">
            <div>
              <dt class="app-label flex items-center gap-1 text-[11px]">
                <ng-container i18n>Unrealized · as of now</ng-container
                ><app-term-info term="unrealizedPnl" />
              </dt>
              <dd><app-pnl [value]="i.unrealizedPnl" [currency]="d.accountCurrency" /></dd>
            </div>
            <div>
              <dt class="app-label flex items-center gap-1 text-[11px]">
                <ng-container i18n>Realized</ng-container><app-term-info term="realizedPnl" />
              </dt>
              <dd><app-pnl [value]="i.realizedPnl - i.fees" [currency]="d.accountCurrency" /></dd>
            </div>
            <div>
              <dt class="app-label text-[11px]" i18n>Dividends</dt>
              <dd><app-pnl [value]="i.dividends" [currency]="d.accountCurrency" /></dd>
            </div>
            <div>
              <dt class="app-label text-[11px]" i18n>Shares held</dt>
              <dd class="tabular-nums">{{ i.quantity | qty }}</dd>
            </div>
            <div>
              <dt class="app-label text-[11px]" i18n>Value · as of now</dt>
              <dd class="tabular-nums">{{ i.value | price: d.accountCurrency }}</dd>
            </div>
            <div>
              <dt class="app-label flex items-center gap-1 text-[11px]">
                <ng-container i18n>Average cost</ng-container><app-term-info term="averageCost" />
              </dt>
              <dd class="tabular-nums">{{ i.averageCost | price: i.instrumentCurrency }}</dd>
            </div>
            <div>
              <dt class="app-label text-[11px]" i18n>Current price</dt>
              <dd class="tabular-nums">{{ i.currentPrice | price: i.instrumentCurrency }}</dd>
            </div>
          </dl>
        </div>

        <div class="mt-4 flex flex-wrap justify-end gap-2">
          @if (i.symbol) {
            <a matButton [routerLink]="['/stock', i.symbol]" (click)="close()" i18n
              >Open stock detail</a
            >
          }
          <a matButton="tonal" [routerLink]="['/portfolio', i.t212Ticker]" (click)="close()" i18n
            >Trades and dividends</a
          >
        </div>
      }
    </div>
  `,
})
export class PositionDialog {
  private readonly api = inject(ApiService);
  private readonly ref = inject(MatDialogRef<PositionDialog>);
  protected readonly data = inject<PositionDialogData>(MAT_DIALOG_DATA);

  protected readonly ranges = RANGES;
  protected readonly rangeLabels = PERIOD_LABELS;
  protected readonly range = signal<PriceRange>('6M');

  protected readonly detail = rxResource({
    params: () => this.data.t212Ticker,
    stream: ({ params }) => this.api.t212Instrument(params),
  });

  private readonly symbol = computed(() =>
    this.detail.hasValue() ? this.detail.value().instrument.symbol : null,
  );

  protected readonly prices = rxResource({
    params: () => ({ symbol: this.symbol(), range: this.range() }),
    stream: ({ params }) =>
      params.symbol ? this.api.prices(params.symbol, params.range) : of(undefined),
  });

  protected readonly ticker = computed(() =>
    this.detail.hasValue() ? displayTicker(this.detail.value().instrument) : this.data.t212Ticker,
  );

  protected readonly chartCurrency = computed(() => majorCurrency(this.prices.value()?.currency));

  /** The position's prices are in the instrument currency; the lines only make sense in the chart's. */
  protected readonly sameCurrency = computed(() => {
    const instrument = this.detail.hasValue()
      ? majorCurrency(this.detail.value().instrument.instrumentCurrency)
      : null;
    return !!instrument && instrument === this.chartCurrency();
  });

  protected readonly chartBars = computed(() => this.prices.value()?.bars ?? []);

  protected readonly chartLabel = computed(
    () => $localize`Price chart with the average cost and the current price`,
  );

  protected close(): void {
    this.ref.close();
  }
}
