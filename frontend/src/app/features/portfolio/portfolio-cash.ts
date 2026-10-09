import { AccountCurrencyPipe } from '../../shared/pipes/format.pipes';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api/api.service';
import { T212Dividend } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { Icon } from '../../shared/icon/icon';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import {
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { PERIOD_CHIP, customPeriodLabel, transactionLabel } from './portfolio-labels';
import {
  PortfolioPeriod,
  SortDirection,
  dayIn,
  displayTicker,
  periodQuery,
  presetRange,
} from './portfolio-model';
import { DividendDialog, DividendDialogData } from './dividend-dialog';
import {
  DEFAULT_DIVIDEND_DIRECTION,
  DEFAULT_DIVIDEND_SORT,
  DIVIDEND_SORTS,
  DIVIDEND_SORT_LABELS,
  DividendSort,
  DividendsFilterContext,
  DividendsFilterSheet,
} from './dividends-filters';
import { InstrumentOption } from './trades-filters';
import { FilterButton } from '../../shared/components/filter-button/filter-button';
import { DIALOG_CONFIG } from '../../shared/components/dialog/dialog';

/** Portfolio → Dividends & cash: dividends with their total, or (switch) deposits, withdrawals, fees and interest. */
@Component({
  selector: 'app-portfolio-cash',
  imports: [
    AccountCurrencyPipe,
    StatList,
    StatRow,
    ErrorState,
    Skeleton,
    StaleChip,
    Icon,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
    Segmented,
    Segment,
    FilterButton,
  ],
  template: `
    <app-segmented
      stretch
      aria-label="Dividends or cash"
      i18n-aria-label
      [value]="view()"
      (valueChange)="view.set($event)"
    >
      <app-segment value="dividends" i18n>Dividends</app-segment>
      <app-segment value="cash" i18n="Deposits, withdrawals, fees and interest">Cash</app-segment>
    </app-segmented>

    @if (view() === 'dividends') {
      <div class="mt-3 flex items-center gap-2.5">
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
              class="app-filter-chip"
              [attr.aria-label]="chip.removeLabel"
              (click)="remove(chip.key)"
            >
              {{ chip.label }}
              <app-icon name="close" [size]="14" />
            </button>
          }
        </div>
      }
      <section aria-labelledby="dividends-title" class="mt-4">
        @if (dividends.error() && !dividends.hasValue()) {
          <h2 id="dividends-title" class="sr-only" i18n>Total dividends</h2>
          <app-error-state
            class="block"
            compact
            [error]="dividends.error()"
            (retry)="dividends.reload()"
          />
        } @else if (!dividends.hasValue()) {
          <div class="space-y-3" aria-hidden="true">
            <app-skeleton shape="card" class="block h-[76px]" />
            <app-skeleton shape="card" class="block h-48 rounded-[22px]" />
          </div>
        } @else {
          @let d = dividends.value();
          @let shownTotal = filtered() ? filteredTotal() : d.total;
          <div class="app-card flex min-w-0 flex-col gap-2">
            <h2 id="dividends-title" class="app-label" i18n>Total dividends</h2>
            <span class="text-[1.5rem] font-semibold" [class]="tone(shownTotal)">{{
              shownTotal | money: (d.accountCurrency | acct)
            }}</span>
          </div>
          @if (d.stale) {
            <div class="mt-3"><app-stale-chip [asOf]="d.asOf" /></div>
          }
          @if (d.items.length === 0) {
            <p class="app-card mt-3.5 text-sm text-on-surface-variant" i18n>
              No dividends in this period.
            </p>
          } @else if (shownDividends().length === 0) {
            <p class="app-card mt-3.5 text-sm text-on-surface-variant" i18n>
              No dividends match the filters in this period.
            </p>
          } @else {
            <ul class="app-card mt-3.5 py-2">
              @for (x of shownDividends(); track x.id) {
                <li>
                  <button
                    type="button"
                    (click)="openDividend(x, d.accountCurrency)"
                    class="w-[calc(100%+1rem)] text-left -mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-2.5 hover:bg-surface-container-high"
                  >
                    <span
                      class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-gain"
                      aria-hidden="true"
                    >
                      <app-icon name="savings" [size]="20" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate app-row-title">{{ x.name }}</span>
                      <span class="mt-0.5 block truncate app-row-meta">
                        {{ day(x.paidAt) | appDate }} · {{ ticker(x) }} · {{ x.quantity | qty }}
                        <ng-container i18n>shares</ng-container>
                        @if (x.grossPerShare !== null) {
                          · {{ x.grossPerShare | price: x.grossPerShareCurrency }}
                          <ng-container i18n>per share</ng-container>
                        }
                      </span>
                    </span>
                    <span class="shrink-0 text-[15px] font-semibold" [class]="tone(x.amount)">{{
                      x.amount | money: (d.accountCurrency | acct)
                    }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        }
      </section>
    } @else {
      <section aria-labelledby="cash-title" class="mt-5">
        <h2 id="cash-title" class="sr-only" i18n>Deposits, withdrawals and fees</h2>
        @if (transactions.error() && !transactions.hasValue()) {
          <app-error-state compact [error]="transactions.error()" (retry)="transactions.reload()" />
        } @else if (!transactions.hasValue()) {
          <app-skeleton shape="card" class="block h-44 rounded-[22px]" aria-hidden="true" />
        } @else {
          @let t = transactions.value();
          <dl appStatList card>
            <div appStatRow label="Deposits" i18n-label>
              {{ t.totals.deposits | price: (t.accountCurrency | acct) }}
            </div>
            <div appStatRow label="Withdrawals" i18n-label>
              {{ t.totals.withdrawals | price: (t.accountCurrency | acct) }}
            </div>
            <div appStatRow label="Account fees" i18n-label>
              {{ t.totals.fees | price: (t.accountCurrency | acct) }}
            </div>
            <div appStatRow label="Interest" i18n-label>
              {{ t.totals.interest | price: (t.accountCurrency | acct) }}
            </div>
          </dl>
          @if (t.items.length === 0) {
            <p class="app-card mt-3.5 text-sm text-on-surface-variant" i18n>
              No deposits, withdrawals, fees or interest in this period.
            </p>
          } @else {
            <ul class="app-card mt-3.5 py-2">
              @for (x of t.items; track x.id) {
                <li class="flex items-center gap-3.5 py-2.5">
                  <span
                    class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high"
                    aria-hidden="true"
                  >
                    <app-icon [name]="x.amount < 0 ? 'trending_down' : 'payments'" [size]="20" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate app-row-title">{{ label(x.type) }}</span>
                    <span class="mt-0.5 block app-row-meta">{{ day(x.at) | appDate }}</span>
                  </span>
                  <span class="shrink-0 text-[15px] font-semibold" [class]="tone(x.amount)">{{
                    x.amount | money: x.currency
                  }}</span>
                </li>
              }
            </ul>
          }
        }
      </section>
    }
  `,
})
export class PortfolioCash {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);

  readonly period = input.required<PortfolioPeriod>();
  /** Removing the custom-period chip goes back to all time. */
  readonly periodChange = output<PortfolioPeriod>();
  readonly version = input(0);

  protected readonly view = persistedSignal<'dividends' | 'cash'>(
    'portfolio.cash.view',
    'dividends',
  );

  private readonly params = computed(() => ({
    query: periodQuery(this.period()),
    version: this.version() + this.t212.dataVersion(),
  }));
  protected readonly dividends = rxResource({
    params: () => this.params(),
    stream: ({ params }) => this.api.t212Dividends(params.query),
  });
  protected readonly transactions = rxResource({
    params: () => this.params(),
    stream: ({ params }) => this.api.t212Transactions(params.query),
  });

  protected readonly search = signal('');
  protected readonly tickers = signal<string[]>([]);
  protected readonly sort = persistedSignal<DividendSort>(
    'portfolio.dividends.sort',
    DEFAULT_DIVIDEND_SORT,
  );
  protected readonly direction = persistedSignal<SortDirection>(
    'portfolio.dividends.direction',
    DEFAULT_DIVIDEND_DIRECTION,
  );
  protected readonly descendingLabel = $localize`Descending, tap for ascending`;
  protected readonly ascendingLabel = $localize`Ascending, tap for descending`;

  /** Stocks that paid a dividend in the period, for the stock filter. */
  protected readonly instruments = computed<InstrumentOption[]>(() => {
    if (!this.dividends.hasValue()) return [];
    const byTicker = new Map<string, InstrumentOption>();
    for (const d of this.dividends.value().items) {
      if (!byTicker.has(d.t212Ticker)) {
        byTicker.set(d.t212Ticker, { t212Ticker: d.t212Ticker, symbol: d.symbol, name: d.name });
      }
    }
    return [...byTicker.values()].sort((a, b) => displayTicker(a).localeCompare(displayTicker(b)));
  });

  protected readonly filtered = computed(() => this.tickers().length > 0 || !!this.search().trim());

  /** Dividends matching the stocks and the search, in the chosen order. */
  protected readonly shownDividends = computed<T212Dividend[]>(() => {
    if (!this.dividends.hasValue()) return [];
    const selected = this.tickers();
    const q = this.search().trim().toLowerCase();
    const items = this.dividends
      .value()
      .items.filter(
        (d) =>
          (!selected.length || selected.includes(d.t212Ticker)) &&
          (!q ||
            d.name.toLowerCase().includes(q) ||
            d.t212Ticker.toLowerCase().includes(q) ||
            (d.symbol ?? '').toLowerCase().includes(q)),
      );
    const sign = this.direction() === 'desc' ? 1 : -1;
    return this.sort() === 'amount'
      ? items.sort((a, b) => sign * (b.amount - a.amount))
      : items.sort((a, b) => sign * b.paidAt.localeCompare(a.paidAt));
  });

  protected readonly filteredTotal = computed(
    () => Math.round(this.shownDividends().reduce((sum, d) => sum + d.amount, 0) * 100) / 100,
  );

  /** A chip for each picked stock and a non-default sort; removing one drops it. */
  protected readonly chips = computed(() => {
    const chips: { key: string; label: string; removeLabel: string }[] = [];
    const periodLabel = customPeriodLabel(this.period());
    if (periodLabel) {
      const removeLabel = $localize`Remove filter ${periodLabel}:filter:`;
      chips.push({ key: PERIOD_CHIP, label: periodLabel, removeLabel });
    }
    for (const ticker of this.tickers()) {
      const option = this.instruments().find((i) => i.t212Ticker === ticker);
      const label = option ? displayTicker(option) : ticker;
      chips.push({ key: ticker, label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    if (this.sort() !== DEFAULT_DIVIDEND_SORT) {
      const label = DIVIDEND_SORT_LABELS[this.sort()];
      chips.push({ key: 'sort', label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    return chips;
  });

  constructor() {
    if (!DIVIDEND_SORTS.includes(this.sort())) this.sort.set(DEFAULT_DIVIDEND_SORT);
  }

  protected openFilters(): void {
    const context: DividendsFilterContext = {
      view: { tickers: this.tickers(), sort: this.sort() },
      instruments: this.instruments,
      change: (view) => {
        this.sort.set(view.sort);
        this.tickers.set(view.tickers);
      },
    };
    this.dialog.open(DividendsFilterSheet, {
      ...DIALOG_CONFIG,
      data: context,
      ariaLabel: $localize`Filters`,
    });
  }

  /** Resets the sort (`sort`) or drops one stock (its t212Ticker). */
  protected remove(key: string): void {
    if (key === PERIOD_CHIP) {
      this.periodChange.emit({ preset: 'ALL', ...presetRange('ALL') });
      return;
    }
    if (key === 'sort') this.sort.set(DEFAULT_DIVIDEND_SORT);
    else this.tickers.update((tickers) => tickers.filter((t) => t !== key));
  }

  protected openDividend(dividend: T212Dividend, currency: string | null): void {
    this.dialog.open<DividendDialog, DividendDialogData>(DividendDialog, {
      data: { dividend, currency },
      ...DIALOG_CONFIG,
    });
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected day(iso: string): string {
    return dayIn(iso);
  }

  protected label(type: string): string {
    return transactionLabel(type);
  }

  protected ticker(item: { symbol: string | null; t212Ticker: string }): string {
    return displayTicker(item);
  }
}
