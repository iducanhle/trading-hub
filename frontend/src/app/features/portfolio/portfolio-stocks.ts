import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
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
import { SORT_LABELS } from './portfolio-labels';
import {
  PortfolioPeriod,
  StatusFilter,
  StockSort,
  displayTicker,
  filterInstruments,
  isAllTime,
  periodQuery,
  sortInstruments,
} from './portfolio-model';

/** Portfolio → Stocks: every instrument of the period with its profit/loss; filter, search, sort. */
@Component({
  selector: 'app-portfolio-stocks',
  imports: [
    RouterLink,
    MatButtonToggleGroup,
    MatButtonToggle,
    MatFormField,
    MatLabel,
    MatPrefix,
    MatInput,
    MatSelect,
    MatOption,
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
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        aria-label="Position status"
        i18n-aria-label
        [value]="status()"
        (change)="status.set($event.value)"
      >
        <mat-button-toggle value="ALL" i18n="All positions">All</mat-button-toggle>
        <mat-button-toggle value="OPEN" i18n="Position status|Shares still held"
          >Open</mat-button-toggle
        >
        <mat-button-toggle value="CLOSED" i18n="Position status|Shares fully sold"
          >Closed</mat-button-toggle
        >
      </mat-button-toggle-group>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="sort-field ml-auto">
        <mat-label i18n>Sort</mat-label>
        <mat-select [value]="sort()" (selectionChange)="sort.set($event.value)">
          @for (option of sortOptions; track option) {
            <mat-option [value]="option">{{ sortLabels[option] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
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
                  [value]="item.totalPnl"
                  [currency]="data.value().accountCurrency"
                  [pct]="allTime() ? item.totalPnlPct : undefined"
                />
              </a>
            </li>
          }
        </ul>
      }
    }
  `,
  styles: `
    .sort-field {
      width: 11rem;
    }
  `,
})
export class PortfolioStocks {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  readonly period = input.required<PortfolioPeriod>();
  readonly version = input(0);

  protected readonly status = persistedSignal<StatusFilter>('portfolio.stocks.status', 'ALL');
  protected readonly sort = persistedSignal<StockSort>('portfolio.stocks.sort', 'pnl');
  protected readonly search = signal('');
  protected readonly sortOptions: StockSort[] = ['pnl', 'pnlPct', 'value', 'lastTrade', 'name'];
  protected readonly sortLabels = SORT_LABELS;
  protected readonly allTime = computed(() => isAllTime(this.period()));

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
          filterInstruments(this.data.value().items, this.status(), this.search()),
          this.sort(),
        )
      : [],
  );

  protected readonly labels = {
    empty: $localize`No stocks in this period`,
    emptyText: $localize`Stocks you trade or receive dividends from appear here.`,
    noMatch: $localize`No stocks match`,
  };

  protected ticker(item: T212Instrument): string {
    return displayTicker(item);
  }
}
