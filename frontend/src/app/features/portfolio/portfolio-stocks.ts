import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatFormField, MatPrefix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
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
import { PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { Pnl } from './pnl';
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
    MatButton,
    MatFormField,
    MatPrefix,
    MatInput,
    EmptyState,
    ErrorState,
    Skeleton,
    StaleChip,
    StockLogo,
    Icon,
    PricePipe,
    QuantityPipe,
    Pnl,
  ],
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button matButton="outlined" type="button" (click)="openFilters()">
        <app-icon matButtonIcon name="tune" [size]="18" />
        <ng-container i18n>Filters</ng-container>
      </button>
      @for (chip of chips(); track chip.key) {
        <button
          type="button"
          class="inline-flex min-h-8 items-center gap-1 rounded-full bg-secondary-container px-3 text-sm text-on-secondary-container"
          [attr.aria-label]="chip.removeLabel"
          (click)="resetPart(chip.key)"
        >
          {{ chip.label }}
          <app-icon name="close" [size]="16" />
        </button>
      }
    </div>
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-3 w-full">
      <app-icon matPrefix name="search" class="mx-2" [size]="20" />
      <input
        matInput
        type="search"
        placeholder="Search by name or ticker"
        i18n-placeholder
        aria-label="Search by name or ticker"
        i18n-aria-label
        [value]="search()"
        (input)="search.set($any($event.target).value)"
      />
    </mat-form-field>

    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <div class="space-y-2" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <app-skeleton shape="card" class="h-16" />
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
        <ul class="divide-y divide-outline-variant/40" aria-label="Stocks" i18n-aria-label>
          @for (item of items(); track item.t212Ticker) {
            <li>
              <a
                [routerLink]="['/portfolio', item.t212Ticker]"
                class="flex min-h-16 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-container-high"
              >
                <app-stock-logo [symbol]="ticker(item)" [logoUrl]="item.logoUrl" [size]="40" />
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-2">
                    <span class="truncate font-medium">{{ item.name }}</span>
                    @if (item.status === 'OPEN') {
                      <span
                        class="shrink-0 rounded-full bg-secondary-container px-2 py-0.5 text-[11px] font-medium text-on-secondary-container"
                        i18n="Position status|Shares still held"
                        >Open</span
                      >
                    } @else {
                      <span
                        class="shrink-0 rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] font-medium text-on-surface-variant"
                        i18n="Position status|Shares fully sold"
                        >Closed</span
                      >
                    }
                  </span>
                  <span class="block truncate text-xs text-on-surface-variant">
                    {{ ticker(item) }}
                    @if (item.status === 'OPEN') {
                      · {{ item.quantity | qty }} <ng-container i18n>shares</ng-container> ·
                      {{ item.value | price: data.value().accountCurrency }}
                    }
                  </span>
                </span>
                <app-pnl
                  strong
                  class="max-w-[45%] text-right"
                  [value]="pnl(item)"
                  [currency]="data.value().accountCurrency"
                  [pct]="allTime() ? pct(item) : undefined"
                />
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
