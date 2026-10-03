import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { isApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { IconName } from '../../shared/icon/icon-paths';
import {
  AppDatePipe,
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import {
  DEFAULT_VIEW,
  InstrumentFilters,
  TimelineItem,
  TimelineView,
  applyView,
} from './instrument-filters';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import { dayIn, displayTicker } from './portfolio-model';

export interface InstrumentDialogData {
  t212Ticker: string;
}

/**
 * `/portfolio/:t212Ticker`: one instrument over all time: position, average cost, profit/loss, and every trade and
 * dividend with the number of shares held after it. Links to the stock page when the symbol is known.
 * Also opens as a dialog (from the stock page) with `InstrumentDialogData`; then it has a close button instead of
 * the page header and no link back to the stock page.
 */
@Component({
  selector: 'app-instrument-page',
  imports: [
    RouterLink,
    MatButton,
    MatIconButton,
    EmptyState,
    ErrorState,
    PageHeader,
    Skeleton,
    StaleChip,
    StockLogo,
    TermInfo,
    Icon,
    InstrumentFilters,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    PercentPipe,
    SignedMoneyPipe,
    HeroAmount,
  ],
  template: `
    @if (dialogRef) {
      <div class="flex items-center gap-3 px-4 pt-3">
        <h2 class="min-w-0 flex-1 truncate text-lg font-bold">{{ title() }}</h2>
        <button matIconButton type="button" aria-label="Close" i18n-aria-label (click)="close()">
          <app-icon name="close" />
        </button>
      </div>
    } @else {
      <app-page-header
        [title]="title()"
        [back]="true"
        backFallback="/portfolio"
        maxWidth="max-w-3xl"
      />
    }
    <div
      class="w-full px-4 pt-2"
      [class]="dialogRef ? 'max-h-[80dvh] overflow-y-auto pb-6' : 'mx-auto max-w-3xl pb-10'"
    >
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
        <div class="flex items-start justify-between gap-3 px-1">
          <div class="min-w-0">
            <p class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1 text-[13px] font-bold"
              >
                <span
                  class="size-2 rounded-full"
                  [class]="i.status === 'OPEN' ? 'bg-primary' : 'bg-on-surface-variant'"
                  aria-hidden="true"
                ></span>
                {{ ticker() }} ·
                @if (i.status === 'OPEN') {
                  <ng-container i18n="Position status|Shares still held">Open</ng-container>
                } @else {
                  <ng-container i18n="Position status|Shares fully sold">Closed</ng-container>
                }
              </span>
            </p>
            @if (i.isin) {
              <p class="mt-2 text-[13px] font-semibold text-on-surface-variant">{{ i.isin }}</p>
            }
          </div>
          <app-stock-logo [symbol]="ticker()" [logoUrl]="i.logoUrl" [size]="56" />
        </div>

        <section class="mt-4 px-1" aria-labelledby="total-pnl">
          <p id="total-pnl" class="app-label inline-flex items-center gap-1">
            <ng-container i18n>Total profit/loss</ng-container><app-term-info term="totalPnl" />
          </p>
          <app-hero-amount
            class="mt-1"
            size="md"
            signed
            [value]="i.totalPnl"
            [currency]="d.accountCurrency"
          />
          @if (i.totalPnlPct !== null) {
            <p class="mt-1 text-[15px] font-semibold" [class]="tone(i.totalPnl)">
              {{ i.totalPnlPct | pct }}
            </p>
          }
        </section>

        <div class="mt-4 grid grid-cols-2 gap-2.5">
          <div class="rounded-[18px] bg-surface-container px-4 py-3.5">
            <p class="app-label inline-flex items-center gap-1 text-[11px]">
              <ng-container i18n>Realized</ng-container><app-term-info term="realizedPnl" />
            </p>
            <p class="mt-1 text-[17px] font-bold" [class]="tone(i.realizedPnl - i.fees)">
              {{ i.realizedPnl - i.fees | money: d.accountCurrency }}
            </p>
          </div>
          <div class="rounded-[18px] bg-surface-container px-4 py-3.5">
            <p class="app-label inline-flex items-center gap-1 text-[11px]">
              <ng-container i18n>Unrealized · as of now</ng-container
              ><app-term-info term="unrealizedPnl" />
            </p>
            <p class="mt-1 text-[17px] font-bold" [class]="tone(i.unrealizedPnl)">
              {{ i.unrealizedPnl | money: d.accountCurrency }}
            </p>
          </div>
        </div>

        <dl class="mt-3.5 rounded-[22px] border border-outline-variant px-5 py-2">
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Value · as of now</dt>
            <dd class="text-right text-[15px] font-semibold">
              {{ i.value | price: d.accountCurrency }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Shares held</dt>
            <dd class="text-right text-[15px] font-semibold">{{ i.quantity | qty }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label inline-flex items-center gap-1">
              <ng-container i18n>Average cost</ng-container><app-term-info term="averageCost" />
            </dt>
            <dd class="text-right text-[15px] font-semibold">
              {{ i.averageCost | price: i.instrumentCurrency }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Current price</dt>
            <dd class="text-right text-[15px] font-semibold">
              {{ i.currentPrice | price: i.instrumentCurrency }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Dividends</dt>
            <dd class="text-right text-[15px] font-semibold" [class]="tone(i.dividends)">
              {{ i.dividends | money: d.accountCurrency }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label inline-flex items-center gap-1">
              <ng-container i18n>FX fees</ng-container><app-term-info term="fxFees" />
            </dt>
            <dd class="text-right text-[15px] font-semibold" [class]="tone(-fxFees())">
              {{ -fxFees() | money: d.accountCurrency }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Bought · sold</dt>
            <dd class="text-right text-[15px] font-semibold">
              {{ i.bought.value | price: d.accountCurrency }} ·
              {{ i.sold.value | price: d.accountCurrency }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>First trade</dt>
            <dd class="text-right text-[15px] font-semibold">
              {{ day(i.firstTradeAt) | appDate }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Last trade</dt>
            <dd class="text-right text-[15px] font-semibold">{{ day(i.lastTradeAt) | appDate }}</dd>
          </div>
        </dl>
        @if (i.symbol && !dialogRef) {
          <a matButton="tonal" class="mt-3.5 w-full" [routerLink]="['/stock', i.symbol]">
            <app-icon matButtonIcon name="show_chart" [size]="20" />
            <ng-container i18n>Open stock detail</ng-container>
          </a>
        }

        <h2 class="mt-7 mb-3 px-1 text-xl font-bold" i18n>Trades and dividends</h2>
        @if (timeline().length > 0) {
          <app-instrument-filters
            class="mb-3.5 block"
            [view]="view()"
            (viewChange)="view.set($event)"
          />
        }
        @if (timeline().length === 0) {
          <p class="app-card text-sm text-on-surface-variant" i18n>
            No trades or dividends synced yet.
          </p>
        } @else if (visible().length === 0) {
          <p class="app-card text-sm text-on-surface-variant" i18n>
            No trades or dividends match the filter.
          </p>
        } @else {
          <ol class="app-card py-2">
            @for (
              item of visible();
              track item.kind + (item.kind === 'trade' ? item.trade.id : item.dividend.id)
            ) {
              <li class="flex items-center gap-3.5 py-3">
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-xl"
                  [class]="tileClass(item)"
                  aria-hidden="true"
                >
                  <app-icon [name]="tileIcon(item)" [size]="20" [strokeWidth]="2" />
                </span>
                @if (item.kind === 'trade') {
                  @let t = item.trade;
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-bold">
                      {{ t.kind === 'TRADE' ? sideLabels[t.side] : kindLabels[t.kind] }}
                      {{ t.quantity | qty }}
                      @if (t.price !== null) {
                        × {{ t.price | price: t.priceCurrency }}
                      }
                    </span>
                    <span class="mt-0.5 block text-[12.5px] font-semibold text-on-surface-variant">
                      {{ day(t.executedAt) | appDate }} ·
                      <ng-container i18n>held after: {{ t.positionAfter | qty }}</ng-container>
                    </span>
                  </span>
                  <span class="flex shrink-0 flex-col items-end text-right">
                    @if (t.value > 0) {
                      <span class="text-[15px] font-bold">{{
                        t.value | price: d.accountCurrency
                      }}</span>
                    }
                    @if (t.realizedPnl !== null) {
                      <span class="mt-0.5 text-[12.5px] font-bold" [class]="tone(t.realizedPnl)">{{
                        t.realizedPnl | money: d.accountCurrency
                      }}</span>
                    }
                  </span>
                } @else {
                  @let v = item.dividend;
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-bold" i18n>Dividend</span>
                    <span class="mt-0.5 block text-[12.5px] font-semibold text-on-surface-variant">
                      {{ day(v.paidAt) | appDate }} · {{ v.quantity | qty }}
                      <ng-container i18n>shares</ng-container>
                    </span>
                  </span>
                  <span class="shrink-0 text-[15px] font-bold" [class]="tone(v.amount)">{{
                    v.amount | money: d.accountCurrency
                  }}</span>
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

  protected readonly dialogRef = inject(MatDialogRef, { optional: true });
  private readonly dialogData = inject<InstrumentDialogData | null>(MAT_DIALOG_DATA, {
    optional: true,
  });

  /** Route parameter (unset in the dialog, which gets the ticker from its data). */
  readonly t212Ticker = input<string>();
  private readonly tickerParam = computed(
    () => this.t212Ticker() ?? this.dialogData?.t212Ticker ?? '',
  );

  protected readonly view = signal<TimelineView>(DEFAULT_VIEW);
  protected readonly sideLabels = SIDE_LABELS;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly data = rxResource({
    params: () => ({ ticker: this.tickerParam(), version: this.t212.dataVersion() }),
    stream: ({ params }) => this.api.t212Instrument(params.ticker),
  });
  protected readonly notFound = computed(() => isApiError(this.data.error(), 'NOT_FOUND'));
  protected readonly ticker = computed(() =>
    this.data.hasValue()
      ? displayTicker(this.data.value().instrument)
      : displayTicker({ symbol: null, t212Ticker: this.tickerParam() }),
  );
  protected readonly title = computed(() =>
    this.data.hasValue() ? this.data.value().instrument.name : this.ticker(),
  );

  /**
   * Fees on all trades, taxes excluded. Trading 212 charges no commission, so in practice this is the currency
   * conversion fee (docs/DATA-SOURCES.md). Already included in Realized.
   */
  protected readonly fxFees = computed(() =>
    this.data.hasValue()
      ? Math.round(this.data.value().trades.reduce((sum, t) => sum + t.fees, 0) * 100) / 100
      : 0,
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

  /** The timeline after the side filter, in the chosen order. */
  protected readonly visible = computed(() => applyView(this.timeline(), this.view()));

  constructor() {
    void this.t212.load();
  }

  protected close(): void {
    this.dialogRef?.close();
  }

  protected day(iso: string | null): string | null {
    return iso ? dayIn(iso) : null;
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** Buys on the accent tint with a down arrow, sells on card2 with an up arrow, dividends in the gain colour. */
  protected tileClass(item: TimelineItem): string {
    if (item.kind === 'dividend') return 'bg-surface-container-high text-gain';
    if (item.trade.kind === 'TRADE' && item.trade.side === 'BUY')
      return 'bg-primary-container text-primary';
    return 'bg-surface-container-high text-on-surface';
  }

  protected tileIcon(item: TimelineItem): IconName {
    if (item.kind === 'dividend') return 'savings';
    if (item.trade.kind !== 'TRADE') return 'swap_vert';
    return item.trade.side === 'BUY' ? 'arrow_down' : 'arrow_up';
  }
}
