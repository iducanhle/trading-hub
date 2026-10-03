import { Component, computed, inject, input, signal } from '@angular/core';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
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
import {
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import {
  DEFAULT_STOCKS_VIEW,
  StocksFilterContext,
  StocksFilterSheet,
  StocksView,
} from './stocks-filters';
import { SORT_LABELS } from './portfolio-labels';
import {
  PortfolioPeriod,
  StockSort,
  displayTicker,
  filterInstruments,
  instrumentPnl,
  instrumentPnlPct,
  isAllTime,
  periodQuery,
  sortInstruments,
} from './portfolio-model';

/** Portfolio → Stocks: every instrument of the period with its profit/loss; filter, search, sort. */
@Component({
  selector: 'app-portfolio-stocks',
  imports: [
    RouterLink,
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
  ],
  template: `
    <div class="flex items-center gap-2.5">
      <label
        class="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-[14px] bg-surface-container px-3.5 text-on-surface-variant"
      >
        <app-icon name="search" [size]="20" />
        <input
          type="search"
          class="min-w-0 flex-1 bg-transparent text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant"
          placeholder="Search by name or ticker"
          i18n-placeholder
          aria-label="Search by name or ticker"
          i18n-aria-label
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </label>
      <app-filter-button [active]="chips().length > 0" (pressed)="openFilters()" />
    </div>
    @if (chips().length) {
      <div class="mt-3 flex flex-wrap items-center gap-2">
        @for (chip of chips(); track chip.key) {
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1 rounded-full bg-surface-container-high px-3.5 text-[13px] font-bold"
            [attr.aria-label]="chip.removeLabel"
            (click)="resetPart(chip.key)"
          >
            {{ chip.label }}
            <app-icon name="close" [size]="16" />
          </button>
        }
      </div>
    }

    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <div class="mt-5 space-y-3" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <app-skeleton shape="card" class="block h-14" />
        }
      </div>
    } @else {
      @if (data.value().stale) {
        <div class="mb-3"><app-stale-chip [asOf]="data.value().asOf" /></div>
      }
      @if (items().length === 0) {
        <app-empty-state
          icon="account_balance_wallet"
          [title]="data.value().items.length ? labels.noMatch : labels.empty"
          [text]="data.value().items.length ? undefined : labels.emptyText"
        />
      } @else {
        <div class="mt-5 flex justify-between px-1">
          <span class="app-label"
            ><ng-container i18n>Stocks</ng-container> · {{ items().length }}</span
          >
          <span class="app-label" i18n>Profit/loss</span>
        </div>
        <ul class="mt-1" aria-label="Stocks" i18n-aria-label>
          @for (item of items(); track item.t212Ticker) {
            <li>
              <a
                [routerLink]="['/portfolio', item.t212Ticker]"
                class="flex items-center gap-3.5 rounded-2xl px-1 py-3 hover:bg-surface-container"
              >
                <app-stock-logo [symbol]="ticker(item)" [logoUrl]="item.logoUrl" [size]="48" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base font-semibold">{{ item.name }}</span>
                  <span class="mt-0.5 flex min-w-0 items-center gap-1.5">
                    @if (item.status === 'OPEN') {
                      <span
                        class="shrink-0 rounded-full bg-primary-container px-[7px] py-[3px] text-[10.5px] font-extrabold tracking-[.04em] text-on-primary-container uppercase"
                        i18n="Position status|Shares still held"
                        >Open</span
                      >
                    } @else {
                      <span
                        class="shrink-0 rounded-full bg-surface-container-high px-[7px] py-[3px] text-[10.5px] font-extrabold tracking-[.04em] text-on-surface-variant uppercase"
                        i18n="Position status|Shares fully sold"
                        >Closed</span
                      >
                    }
                    <span class="truncate text-[12.5px] font-semibold text-on-surface-variant">
                      {{ ticker(item) }}
                      @if (item.status === 'OPEN') {
                        · {{ item.quantity | qty }} <ng-container i18n>shares</ng-container> ·
                        {{ item.value | price: data.value().accountCurrency }}
                      }
                    </span>
                  </span>
                </span>
                <span class="flex max-w-[45%] shrink-0 flex-col items-end text-right">
                  <span class="text-base font-bold" [class]="tone(pnl(item))">{{
                    pnl(item) | money: data.value().accountCurrency
                  }}</span>
                  @if (allTime()) {
                    <span class="mt-0.5 text-[12.5px] font-bold" [class]="tone(pnl(item))">{{
                      pct(item) | pct
                    }}</span>
                  }
                </span>
              </a>
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

  protected readonly unrealized = persistedSignal<boolean>(
    'portfolio.stocks.unrealized',
    DEFAULT_STOCKS_VIEW.unrealized,
  );
  protected readonly sort = persistedSignal<StockSort>(
    'portfolio.stocks.sort',
    DEFAULT_STOCKS_VIEW.sort,
  );
  protected readonly search = signal('');
  protected readonly allTime = computed(() => isAllTime(this.period()));
  private readonly sheet = inject(MatBottomSheet);

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** A chip for each setting that differs from the default; removing it resets that setting. */
  protected readonly chips = computed(() => {
    const chips: { key: keyof StocksView; label: string; removeLabel: string }[] = [];
    if (this.unrealized() !== DEFAULT_STOCKS_VIEW.unrealized) {
      const label = $localize`:Profit/loss basis|Includes unrealized:With unrealized`;
      chips.push({
        key: 'unrealized',
        label,
        removeLabel: $localize`Remove filter ${label}:filter:`,
      });
    }
    if (this.sort() !== DEFAULT_STOCKS_VIEW.sort) {
      const label = SORT_LABELS[this.sort()];
      chips.push({ key: 'sort', label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    return chips;
  });

  protected openFilters(): void {
    const context: StocksFilterContext = {
      view: { unrealized: this.unrealized(), sort: this.sort() },
      change: (view) => {
        this.unrealized.set(view.unrealized);
        this.sort.set(view.sort);
      },
    };
    this.sheet.open(StocksFilterSheet, { data: context, ariaLabel: $localize`Filters` });
  }

  protected resetPart(key: keyof StocksView): void {
    if (key === 'unrealized') this.unrealized.set(DEFAULT_STOCKS_VIEW.unrealized);
    else this.sort.set(DEFAULT_STOCKS_VIEW.sort);
  }

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
          filterInstruments(this.data.value().items, this.search()),
          this.sort(),
          this.unrealized(),
        )
      : [],
  );

  protected readonly labels = {
    empty: $localize`No stocks in this period`,
    emptyText: $localize`Stocks you trade or receive dividends from appear here.`,
    noMatch: $localize`No stocks match`,
  };

  protected pnl(item: T212Instrument): number {
    return instrumentPnl(item, this.unrealized());
  }

  protected pct(item: T212Instrument): number | null {
    return instrumentPnlPct(item, this.unrealized());
  }

  protected ticker(item: T212Instrument): string {
    return displayTicker(item);
  }
}
