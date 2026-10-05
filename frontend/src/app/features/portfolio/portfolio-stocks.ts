import { AccountCurrencyPipe } from '../../shared/pipes/format.pipes';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api/api.service';
import { T212Instrument } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { FilterButton } from '../../shared/components/filter-button/filter-button';
import { TermInfo } from '../../shared/components/term-info/term-info';
// import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import {
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import {
  DEFAULT_STOCKS_DIRECTION,
  DEFAULT_STOCKS_VIEW,
  STOCK_SORTS,
  StocksFilterContext, StocksFilterSheet } from './stocks-filters';
import { SORT_LABELS } from './portfolio-labels';
import {
  PortfolioPeriod,
  SortDirection,
  StockSort,
  displayTicker,
  filterInstruments,
  instrumentPnl,
  instrumentPnlPct,
  isAllTime,
  periodQuery,
  sortInstruments,
} from './portfolio-model';
import { PositionDialog, PositionDialogData } from './position-dialog';
import { DIALOG_CONFIG } from '../../shared/components/dialog/dialog';

/**
 * Portfolio → Stocks: every instrument of the period with its profit/loss; filter, search, sort.
 * Tapping a stock opens its chart and profit/loss in a dialog.
 */
@Component({
  selector: 'app-portfolio-stocks',
  imports: [
    AccountCurrencyPipe,
    EmptyState,
    ErrorState,
    Skeleton,
    StaleChip,
    StockLogo,
    Icon,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
    PercentPipe,
    FilterButton,
    TermInfo,
    // Segmented, Segment: for the unrealized switch, turned off (see the template).
  ],
  template: `
    <div class="flex items-center gap-2.5">
      <label
        class="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] bg-surface-container px-3.5 text-on-surface-variant"
      >
        <app-icon name="search" [size]="18" />
        <input
          type="search"
          class="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant"
          placeholder="Search by name or ticker"
          i18n-placeholder
          aria-label="Search by name or ticker"
          i18n-aria-label
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </label>
      <button
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-surface-container text-on-surface hover:bg-surface-container-high"
        [attr.aria-label]="direction() === 'desc' ? descendingLabel : ascendingLabel"
        (click)="direction.set(direction() === 'desc' ? 'asc' : 'desc')"
      >
        <app-icon [name]="direction() === 'desc' ? 'sort_desc' : 'sort_asc'" />
      </button>
      <app-filter-button [active]="chips().length > 0" (pressed)="openFilters()" />
    </div>
    @if (chips().length) {
      <div class="mt-3 flex flex-wrap items-center gap-2">
        @for (chip of chips(); track chip.key) {
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1 rounded-full bg-surface-container-high px-3.5 text-[13px] font-bold"
            [attr.aria-label]="chip.removeLabel"
            (click)="removeChip(chip.key)"
          >
            {{ chip.label }}
            <app-icon name="close" [size]="16" />
          </button>
        }
      </div>
    }

    <!-- Switch "Without / With unrealized", turned off for now. To bring it back, uncomment it and the
      withUnrealized line in the class, and add back the Czech: "Zisk a ztráta", "Bez nerealizovaného",
      "S nerealizovaným", "Nerealizovaný výsledek uvidíte v období Vše" (npm run i18n:check lists the ids).
    @if (allTime()) {
      <app-segmented
        class="mt-3"
        aria-label="Profit and loss"
        i18n-aria-label
        stretch
        [value]="unrealized()"
        (valueChange)="unrealized.set($event)"
      >
        <app-segment [value]="false" i18n="Profit/loss basis|Realized only">Without</app-segment>
        <app-segment [value]="true" i18n="Profit/loss basis|Includes unrealized"
          >With unrealized</app-segment
        >
      </app-segmented>
    } @else {
      (info line: same size as the switch, 3 px track + 36 px option, so the list does not jump)
      <p
        class="mt-3 flex h-[42px] items-center justify-center gap-1.5 rounded-full bg-surface-container px-3.5 text-[13px] leading-tight font-medium text-on-surface-variant"
      >
        <app-icon name="info" [size]="14" class="shrink-0" />
        <ng-container i18n="Shown instead of the unrealized switch outside the All period"
          >Switch to All to see the unrealized profit/loss</ng-container
        >
      </p>
    }
    -->

    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <div class="mt-4 space-y-3" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <app-skeleton shape="card" class="block h-14" />
        }
      </div>
    } @else {
      @if (data.value().stale) {
        <div class="mt-4 mb-3"><app-stale-chip [asOf]="data.value().asOf" /></div>
      }
      @if (items().length === 0) {
        <app-empty-state
          icon="account_balance_wallet"
          [title]="data.value().items.length ? labels.noMatch : labels.empty"
          [text]="data.value().items.length ? undefined : labels.emptyText"
        />
      } @else {
        <section
          class="app-card mt-4 grid gap-3.5"
          [class]="totalAfterFees() ? 'grid-cols-2' : 'grid-cols-1'"
        >
          <div class="flex min-w-0 flex-col gap-2">
            <h2 class="app-label" i18n>Total profit/loss</h2>
            <span class="text-[15px] font-semibold" [class]="tone(total())">{{
              total() | money: (data.value().accountCurrency | acct)
            }}</span>
          </div>
          @if (totalAfterFees(); as afterFees) {
            <div class="flex min-w-0 flex-col gap-2 border-l border-outline-variant pl-3.5">
              <h2 class="app-label">
                <ng-container i18n>Including fees</ng-container>
                <app-term-info class="ml-0.5 inline-flex align-middle" term="accountFees" />
              </h2>
              <span class="text-[15px] font-semibold" [class]="tone(afterFees.value)">{{
                afterFees.value | money: (data.value().accountCurrency | acct)
              }}</span>
            </div>
          }
        </section>
        @if (extremes().length) {
          <section
            class="app-card mt-4 grid grid-cols-2 gap-3.5"
            aria-label="Best and worst"
            i18n-aria-label
          >
            @for (row of extremes(); track row.label; let second = $odd) {
              <button
                type="button"
                (click)="openPosition(row.item)"
                class="flex min-w-0 flex-col gap-2 text-left"
                [class]="second ? 'border-l border-outline-variant pl-3.5' : ''"
              >
                <span class="app-label">{{ row.label }}</span>
                <span class="flex min-w-0 items-center gap-2.5">
                  <app-stock-logo
                    [symbol]="ticker(row.item)"
                    [logoUrl]="row.item.logoUrl"
                    [size]="40"
                  />
                  <span class="line-clamp-2 min-w-0 text-sm leading-tight font-medium">{{
                    row.item.name
                  }}</span>
                </span>
                <span class="text-[15px] font-semibold" [class]="tone(pnl(row.item))">{{
                  pnl(row.item) | money: (data.value().accountCurrency | acct)
                }}</span>
              </button>
            }
          </section>
        }
        <div class="mt-4 flex justify-between px-1">
          <span class="app-label"
            ><ng-container i18n>Stocks</ng-container> · {{ items().length }}</span
          >
          <span class="app-label" i18n>Profit/loss</span>
        </div>
        <ul class="mt-1" aria-label="Stocks" i18n-aria-label>
          @for (item of items(); track item.t212Ticker) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-3.5 rounded-2xl px-1 py-3 text-left hover:bg-surface-container"
                (click)="openPosition(item)"
              >
                <app-stock-logo [symbol]="ticker(item)" [logoUrl]="item.logoUrl" [size]="40" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate app-row-title">{{ item.name }}</span>
                  <span class="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <span class="truncate app-row-meta">
                      {{ ticker(item) }}
                      @if (item.status === 'OPEN') {
                        · {{ item.quantity | qty }} <ng-container i18n>shares</ng-container> ·
                        {{ item.value | price: (data.value().accountCurrency | acct) }}
                      }
                    </span>
                  </span>
                </span>
                <span class="flex max-w-[45%] shrink-0 flex-col items-end text-right">
                  <span class="text-[15px] font-semibold" [class]="tone(pnl(item))">{{
                    pnl(item) | money: (data.value().accountCurrency | acct)
                  }}</span>
                  @if (allTime()) {
                    <span class="mt-0.5 text-[13px] font-medium" [class]="tone(pnl(item))">{{
                      pct(item) | pct
                    }}</span>
                  }
                </span>
              </button>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class PortfolioStocks {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  readonly period = input.required<PortfolioPeriod>();
  readonly version = input(0);

  protected readonly unrealized = persistedSignal<boolean>('portfolio.stocks.unrealized', false);
  protected readonly sort = persistedSignal<StockSort>(
    'portfolio.stocks.sort',
    DEFAULT_STOCKS_VIEW.sort,
  );
  constructor() {
    // A sort saved before it was removed ("last trade") falls back to the default.
    if (!STOCK_SORTS.includes(this.sort())) this.sort.set(DEFAULT_STOCKS_VIEW.sort);
  }
  protected readonly direction = persistedSignal<SortDirection>(
    'portfolio.stocks.direction',
    DEFAULT_STOCKS_DIRECTION,
  );
  protected readonly descendingLabel = $localize`Descending, tap for ascending`;
  protected readonly ascendingLabel = $localize`Ascending, tap for descending`;
  protected readonly search = signal('');
  /** Selected t212Tickers; empty = all stocks. */
  protected readonly tickers = signal<string[]>([]);
  protected readonly allTime = computed(() => isAllTime(this.period()));
  /**
   * Unrealized counts only for all time: in a shorter period the list holds only stocks active in it, and the
   * unrealized is the whole holding's as of now, so adding it would give a sum that means nothing.
   */
  // private readonly withUnrealized = computed(() => this.allTime() && this.unrealized());
  private readonly withUnrealized = computed(() => false); // The switch is turned off: realized only.
  private readonly dialog = inject(MatDialog);

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** A chip for each setting that differs from the default; removing it resets that setting. */
  protected readonly chips = computed(() => {
    const chips: { key: string; label: string; removeLabel: string }[] = [];
    const items = this.data.hasValue() ? this.data.value().items : [];
    for (const ticker of this.tickers()) {
      const item = items.find((i) => i.t212Ticker === ticker);
      const label = item ? displayTicker(item) : ticker;
      chips.push({ key: ticker, label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    if (this.sort() !== DEFAULT_STOCKS_VIEW.sort) {
      const label = SORT_LABELS[this.sort()];
      chips.push({ key: 'sort', label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    return chips;
  });

  protected openFilters(): void {
    const context: StocksFilterContext = {
      view: { tickers: this.tickers(), sort: this.sort() },
      instruments: this.instrumentOptions,
      change: (view) => {
        this.tickers.set(view.tickers);
        this.sort.set(view.sort);
      },
    };
    this.dialog.open(StocksFilterSheet, {
      ...DIALOG_CONFIG,
      data: context,
      ariaLabel: $localize`Filters`,
    });
  }

  protected openPosition(item: T212Instrument): void {
    this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
      data: {
        t212Ticker: item.t212Ticker,
        period: this.period(),
        includeUnrealized: this.withUnrealized(),
      },
      ...DIALOG_CONFIG,
    });
  }

  protected removeChip(key: string): void {
    if (key === 'sort') this.sort.set(DEFAULT_STOCKS_VIEW.sort);
    else this.tickers.update((tickers) => tickers.filter((t) => t !== key));
  }

  /** Stocks of the period for the filter, by ticker. */
  private readonly instrumentOptions = computed(() =>
    this.data.hasValue()
      ? [...this.data.value().items].sort((a, b) =>
          displayTicker(a).localeCompare(displayTicker(b)),
        )
      : [],
  );

  protected readonly data = rxResource({
    params: () => ({
      query: periodQuery(this.period()),
      version: this.version() + this.t212.dataVersion(),
    }),
    stream: ({ params }) => this.api.t212Instruments({ ...params.query, status: 'ALL' }),
  });

  protected readonly items = computed(() =>
    this.data.hasValue()
      ? sortInstruments(
          filterInstruments(this.data.value().items, this.search()).filter(
            (i) => !this.tickers().length || this.tickers().includes(i.t212Ticker),
          ),
          this.sort(),
          this.withUnrealized(),
          this.direction(),
        )
      : [],
  );

  /** Sum of the listed stocks' profit/loss, on the same basis as the rows. */
  protected readonly total = computed(() =>
    this.items().reduce((sum, item) => sum + this.pnl(item), 0),
  );

  /** Fees taken from the account outside any stock (mostly card deposits), in the same period. */
  private readonly accountFees = rxResource({
    params: () => ({
      query: periodQuery(this.period()),
      version: this.version() + this.t212.dataVersion(),
    }),
    stream: ({ params }) => this.api.t212Transactions(params.query),
  });

  /** The total minus account fees; only for the whole list, since the fees belong to no stock. */
  protected readonly totalAfterFees = computed(() =>
    this.search().trim() || this.tickers().length || !this.accountFees.hasValue()
      ? null
      : { value: this.total() - this.accountFees.value().totals.fees },
  );

  /** Best and worst stock of the period by profit/loss, on the same basis as the rows and within the search, like the total. */
  protected readonly extremes = computed(() => {
    if (!this.data.hasValue()) return [];
    const ranked = [...this.items()].sort((a, b) => this.pnl(b) - this.pnl(a));
    const rows: { label: string; item: T212Instrument }[] = [];
    if (ranked.length) rows.push({ label: $localize`Best`, item: ranked[0] });
    if (ranked.length > 1) rows.push({ label: $localize`Worst`, item: ranked[ranked.length - 1] });
    return rows;
  });

  protected readonly labels = {
    empty: $localize`No stocks in this period`,
    emptyText: $localize`Stocks you trade or receive dividends from appear here.`,
    noMatch: $localize`No stocks match`,
  };

  protected pnl(item: T212Instrument): number {
    return instrumentPnl(item, this.withUnrealized());
  }

  protected pct(item: T212Instrument): number | null {
    return instrumentPnlPct(item, this.withUnrealized());
  }

  protected ticker(item: T212Instrument): string {
    return displayTicker(item);
  }
}
