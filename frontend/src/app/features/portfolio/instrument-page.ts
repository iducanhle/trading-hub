import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { isApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { T212DetailTrade, T212Dividend } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import { AppDatePipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import { dayIn, displayTicker } from './portfolio-model';

type TimelineItem =
  | { kind: 'trade'; at: string; trade: T212DetailTrade }
  | { kind: 'dividend'; at: string; dividend: T212Dividend };

/**
 * `/portfolio/:t212Ticker`: one instrument over all time: position, average cost, profit/loss, and every trade and
 * dividend with the number of shares held after it. Links to the stock page when the symbol is known.
 */
@Component({
  selector: 'app-instrument-page',
  imports: [
    RouterLink,
    MatButton,
    EmptyState,
    ErrorState,
    PageHeader,
    Skeleton,
    StaleChip,
    StockLogo,
    TermInfo,
    Icon,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    Pnl,
  ],
  template: `
    <app-page-header
      [title]="title()"
      [back]="true"
      backFallback="/portfolio"
      maxWidth="max-w-3xl"
    />
    <div class="mx-auto max-w-3xl px-4 pt-2 pb-10">
      @if (data.error() && !data.hasValue()) {
        @if (notFound()) {
          <app-empty-state
            icon="search_off"
            title="Not in your portfolio"
            i18n-title
            text="You have no trades, dividends or position in this instrument."
            i18n-text
          />
        } @else {
          <app-error-state [error]="data.error()" (retry)="data.reload()" />
        }
      } @else if (!data.hasValue()) {
        <div class="space-y-3" aria-hidden="true">
          <app-skeleton shape="card" class="h-24" />
          <app-skeleton shape="card" class="h-40" />
          <app-skeleton shape="card" class="h-56" />
        </div>
      } @else {
        @let d = data.value();
        @let i = d.instrument;
        @if (d.stale) {
          <div class="mb-3"><app-stale-chip [asOf]="d.asOf" /></div>
        }
        <div class="flex items-center gap-3">
          <app-stock-logo [symbol]="ticker()" [logoUrl]="i.logoUrl" [size]="48" />
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-semibold">{{ i.name }}</h1>
            <p class="text-sm text-on-surface-variant">
              {{ ticker() }}
              @if (i.isin) {
                · {{ i.isin }}
              }
              ·
              @if (i.status === 'OPEN') {
                <span class="font-medium text-on-surface" i18n="Position status|Shares still held"
                  >Open</span
                >
              } @else {
                <ng-container i18n="Position status|Shares fully sold">Closed</ng-container>
              }
            </p>
          </div>
        </div>

        <div class="mt-4 rounded-3xl bg-surface-container-low p-4">
          <p class="flex items-center gap-1 text-xs text-on-surface-variant">
            <ng-container i18n>Total profit/loss</ng-container><app-term-info term="totalPnl" />
          </p>
          <app-pnl
            strong
            class="mt-1 text-2xl"
            [value]="i.totalPnl"
            [currency]="d.accountCurrency"
            [pct]="i.totalPnlPct"
          />
          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt class="flex items-center gap-1 text-xs text-on-surface-variant">
                <ng-container i18n>Realized</ng-container><app-term-info term="realizedPnl" />
              </dt>
              <dd><app-pnl [value]="i.realizedPnl - i.fees" [currency]="d.accountCurrency" /></dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-xs text-on-surface-variant">
                <ng-container i18n>Unrealized · as of now</ng-container
                ><app-term-info term="unrealizedPnl" />
              </dt>
              <dd><app-pnl [value]="i.unrealizedPnl" [currency]="d.accountCurrency" /></dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>Dividends</dt>
              <dd><app-pnl [value]="i.dividends" [currency]="d.accountCurrency" /></dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>Shares held</dt>
              <dd class="tabular-nums">{{ i.quantity | qty }}</dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-xs text-on-surface-variant">
                <ng-container i18n>Average cost</ng-container><app-term-info term="averageCost" />
              </dt>
              <dd class="tabular-nums">{{ i.averageCost | price: i.instrumentCurrency }}</dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>Current price</dt>
              <dd class="tabular-nums">{{ i.currentPrice | price: i.instrumentCurrency }}</dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>Value · as of now</dt>
              <dd class="tabular-nums">{{ i.value | price: d.accountCurrency }}</dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>Bought · sold</dt>
              <dd class="tabular-nums">
                {{ i.bought.value | price: d.accountCurrency }} ·
                {{ i.sold.value | price: d.accountCurrency }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>First trade</dt>
              <dd>{{ day(i.firstTradeAt) | appDate }}</dd>
            </div>
            <div>
              <dt class="text-xs text-on-surface-variant" i18n>Last trade</dt>
              <dd>{{ day(i.lastTradeAt) | appDate }}</dd>
            </div>
          </dl>
          @if (i.symbol) {
            <a matButton="tonal" class="mt-4" [routerLink]="['/stock', i.symbol]">
              <app-icon matButtonIcon name="show_chart" [size]="18" />
              <ng-container i18n>Open stock detail</ng-container>
            </a>
          }
        </div>

        <h2 class="mt-6 mb-2 text-base font-semibold" i18n>Trades and dividends</h2>
        @if (timeline().length === 0) {
          <p class="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant" i18n>
            No trades or dividends synced yet.
          </p>
        } @else {
          <ol class="relative ml-3 border-l border-outline-variant">
            @for (
              item of timeline();
              track item.kind + (item.kind === 'trade' ? item.trade.id : item.dividend.id)
            ) {
              <li class="relative py-2 pl-5">
                <span
                  class="absolute top-4 -left-[5px] size-2.5 rounded-full"
                  [class]="dotClass(item)"
                  aria-hidden="true"
                ></span>
                @if (item.kind === 'trade') {
                  @let t = item.trade;
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium">
                        {{ t.kind === 'TRADE' ? sideLabels[t.side] : kindLabels[t.kind] }}
                        {{ t.quantity | qty }}
                        @if (t.price !== null) {
                          × {{ t.price | price: t.priceCurrency }}
                        }
                      </p>
                      <p class="text-xs text-on-surface-variant">
                        {{ day(t.executedAt) | appDate }} ·
                        <ng-container i18n>held after: {{ t.positionAfter | qty }}</ng-container>
                      </p>
                    </div>
                    <div class="flex shrink-0 flex-col items-end text-sm">
                      @if (t.value > 0) {
                        <span class="tabular-nums">{{ t.value | price: d.accountCurrency }}</span>
                      }
                      @if (t.realizedPnl !== null) {
                        <app-pnl
                          class="text-xs"
                          [value]="t.realizedPnl"
                          [currency]="d.accountCurrency"
                        />
                      }
                    </div>
                  </div>
                } @else {
                  @let v = item.dividend;
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium" i18n>Dividend</p>
                      <p class="text-xs text-on-surface-variant">
                        {{ day(v.paidAt) | appDate }} · {{ v.quantity | qty }}
                        <ng-container i18n>shares</ng-container>
                      </p>
                    </div>
                    <app-pnl class="text-sm" [value]="v.amount" [currency]="d.accountCurrency" />
                  </div>
                }
              </li>
            }
          </ol>
        }
      }
    </div>
  `,
})
export class InstrumentPage {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  /** Route parameter. */
  readonly t212Ticker = input.required<string>();

  protected readonly sideLabels = SIDE_LABELS;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly data = rxResource({
    params: () => ({ ticker: this.t212Ticker(), version: this.t212.dataVersion() }),
    stream: ({ params }) => this.api.t212Instrument(params.ticker),
  });
  protected readonly notFound = computed(() => isApiError(this.data.error(), 'NOT_FOUND'));
  protected readonly ticker = computed(() =>
    this.data.hasValue()
      ? displayTicker(this.data.value().instrument)
      : displayTicker({ symbol: null, t212Ticker: this.t212Ticker() }),
  );
  protected readonly title = computed(() =>
    this.data.hasValue() ? this.data.value().instrument.name : this.ticker(),
  );

  /** Trades and dividends together, newest first. */
  protected readonly timeline = computed<TimelineItem[]>(() => {
    if (!this.data.hasValue()) return [];
    const { trades, dividends } = this.data.value();
    return [
      ...trades.map((trade): TimelineItem => ({ kind: 'trade', at: trade.executedAt, trade })),
      ...dividends.map((dividend): TimelineItem => ({
        kind: 'dividend',
        at: dividend.paidAt,
        dividend,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  });

  constructor() {
    void this.t212.load();
  }

  protected day(iso: string | null): string | null {
    return iso ? dayIn(iso) : null;
  }

  protected dotClass(item: TimelineItem): string {
    if (item.kind === 'dividend') return 'bg-gain';
    if (item.trade.kind !== 'TRADE') return 'bg-outline';
    return item.trade.side === 'BUY' ? 'bg-primary' : 'bg-inverse-surface';
  }
}
