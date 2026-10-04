import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { ApiService, T212TradesQuery } from '../../core/api/api.service';
import { T212Side, T212Trade } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { InView } from '../../shared/directives/in-view';
import { Icon } from '../../shared/icon/icon';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { FilterButton } from '../../shared/components/filter-button/filter-button';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import {
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import {
  PortfolioPeriod,
  displayTicker,
  filterInstruments,
  groupTradesByDay,
  periodQuery,
} from './portfolio-model';
import { TradeDialog, TradeDialogData } from './trade-dialog';
import {
  DEFAULT_TRADE_SORT,
  InstrumentOption,
  TRADE_SORT_LABELS,
  TradeFilters,
  TradeSort,
  TradesFilterContext,
  TradesFilterSheet,
} from './trades-filters';

const PAGE_SIZE = 50;

interface ListState {
  items: T212Trade[];
  next: string | null;
  loading: boolean;
  error: unknown;
  currency: string | null;
  stale: boolean;
  asOf: string | null;
  loaded: boolean;
}

const EMPTY: ListState = {
  items: [],
  next: null,
  loading: true,
  error: null,
  currency: null,
  stale: false,
  asOf: null,
  loaded: false,
};

/**
 * Portfolio → Trades: filled trades, newest first, grouped by day and loaded 50 at a time as the list scrolls.
 * Side is on the page; stocks and sort are in the filter sheet, as on the Stocks tab. Side and stocks live in the URL;
 * the search narrows the stocks, and sorts other than newest first load the whole period (day sections only for
 * oldest first).
 */
@Component({
  selector: 'app-portfolio-trades',
  imports: [
    MatButton,
    EmptyState,
    ErrorState,
    Skeleton,
    StaleChip,
    InView,
    Icon,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
    FilterButton,
    Segmented,
    Segment,
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
            (click)="remove(chip.key)"
          >
            {{ chip.label }}
            <app-icon name="close" [size]="16" />
          </button>
        }
      </div>
    }

    <app-segmented
      class="mt-3 mb-5"
      aria-label="Trade side"
      i18n-aria-label
      stretch
      [value]="filters().side ?? 'ALL'"
      (valueChange)="setSide($event)"
    >
      <app-segment value="ALL" i18n="All trades">All</app-segment>
      <app-segment value="BUY" i18n="Trade direction|Kind of trade">Buy</app-segment>
      <app-segment value="SELL" i18n="Trade direction|Kind of trade">Sell</app-segment>
    </app-segmented>

    @if (state().error && !state().loaded) {
      <app-error-state [error]="state().error" (retry)="reload()" />
    } @else if (!ready()) {
      <div class="space-y-3" aria-hidden="true">
        @for (i of [1, 2]; track i) {
          <app-skeleton shape="card" class="block h-56 rounded-[22px]" />
        }
      </div>
    } @else {
      @if (state().stale) {
        <div class="mb-3"><app-stale-chip [asOf]="state().asOf" /></div>
      }
      @if (state().items.length === 0) {
        <app-empty-state icon="receipt_long" title="No trades" i18n-title [text]="emptyText()">
          @if (filtered()) {
            <button matButton="outlined" type="button" (click)="clearFilters()" i18n>
              Reset filters
            </button>
          }
        </app-empty-state>
      } @else {
        @for (day of days(); track day.date) {
          <section class="app-card mt-4 pt-3.5 pb-1 first-of-type:mt-0">
            @if (day.date) {
              <h3 class="app-label">
                {{ day.date | appDate: 'long' }}
              </h3>
            }
            <ul>
              @for (t of day.items; track t.id) {
                <li>
                  <button
                    type="button"
                    (click)="openTrade(t)"
                    class="w-[calc(100%+1rem)] text-left -mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-[11px] hover:bg-surface-container-high"
                  >
                    <span
                      class="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      [class]="
                        t.kind === 'TRADE' && t.side === 'BUY'
                          ? 'bg-primary-container text-primary'
                          : 'bg-surface-container-high text-on-surface'
                      "
                      aria-hidden="true"
                    >
                      <app-icon
                        [name]="
                          t.kind !== 'TRADE'
                            ? 'swap_vert'
                            : t.side === 'BUY'
                              ? 'arrow_down'
                              : 'arrow_up'
                        "
                        [size]="20"
                        [strokeWidth]="2"
                      />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[15px] font-medium">{{ t.name }}</span>
                      <span
                        class="mt-0.5 block truncate text-[12.5px] font-semibold text-on-surface-variant"
                      >
                        {{ t.kind === 'TRADE' ? sideLabels[t.side] : kindLabels[t.kind] }} ·
                        {{ ticker(t) }} · {{ t.quantity | qty }}
                        @if (t.price !== null) {
                          × {{ t.price | price: t.priceCurrency }}
                        }
                      </span>
                    </span>
                    <span class="flex shrink-0 flex-col items-end text-right">
                      <span class="text-[15px] font-semibold">{{
                        t.value | price: state().currency
                      }}</span>
                      @if (t.realizedPnl !== null) {
                        <span
                          class="mt-0.5 text-[12.5px] font-medium"
                          [class]="tone(t.realizedPnl)"
                          >{{ t.realizedPnl | money: state().currency }}</span
                        >
                      }
                    </span>
                  </button>
                </li>
              }
            </ul>
          </section>
        }
        @if (state().next) {
          <div appInView (inView)="loadMore()" class="flex justify-center py-4">
            @if (state().error) {
              <button matButton="outlined" type="button" (click)="loadMore()" i18n>
                Load more
              </button>
            } @else {
              <app-skeleton class="h-6 w-32" />
            }
          </div>
        }
      }
    }
  `,
})
export class PortfolioTrades {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);

  protected openTrade(trade: T212Trade): void {
    this.dialog.open<TradeDialog, TradeDialogData>(TradeDialog, {
      data: { trade, currency: this.state().currency, period: this.period() },
      width: 'calc(100vw - 32px)',
      maxWidth: '32rem',
      autoFocus: 'dialog',
    });
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  readonly period = input.required<PortfolioPeriod>();
  readonly version = input(0);
  readonly filters = input<TradeFilters>({ side: null, tickers: [] });
  readonly filtersChange = output<TradeFilters>();

  protected readonly sideLabels = SIDE_LABELS;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly state = signal<ListState>(EMPTY);
  private request?: Subscription;
  private readonly localVersion = signal(0);

  /** Instruments traded in the period, for the stock filter. */
  private readonly instrumentList = rxResource({
    params: () => ({ query: periodQuery(this.period()), version: this.t212.dataVersion() }),
    stream: ({ params }) => this.api.t212Instruments({ ...params.query, status: 'ALL' }),
  });
  protected readonly instruments = computed<InstrumentOption[]>(() =>
    this.instrumentList.hasValue()
      ? this.instrumentList
          .value()
          .items.filter((i) => i.tradeCount > 0)
          .sort((a, b) => displayTicker(a).localeCompare(displayTicker(b)))
      : [],
  );

  protected readonly search = signal('');
  protected readonly sort = persistedSignal<TradeSort>('portfolio.trades.sort', DEFAULT_TRADE_SORT);
  private readonly sheet = inject(MatBottomSheet);

  /** A chip for each picked stock and a non-default sort; removing one drops it. */
  protected readonly chips = computed(() => {
    const chips: { key: string; label: string; removeLabel: string }[] = [];
    for (const ticker of this.filters().tickers) {
      const option = this.instruments().find((i) => i.t212Ticker === ticker);
      const label = option ? displayTicker(option) : ticker;
      chips.push({ key: ticker, label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    if (this.sort() !== DEFAULT_TRADE_SORT) {
      const label = TRADE_SORT_LABELS[this.sort()];
      chips.push({ key: 'sort', label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    return chips;
  });

  protected openFilters(): void {
    const context: TradesFilterContext = {
      view: { tickers: this.filters().tickers, sort: this.sort() },
      instruments: this.instruments,
      change: (view) => {
        this.sort.set(view.sort);
        const current = this.filters().tickers;
        const same =
          view.tickers.length === current.length && view.tickers.every((t) => current.includes(t));
        if (!same) this.filtersChange.emit({ ...this.filters(), tickers: view.tickers });
      },
    };
    this.sheet.open(TradesFilterSheet, { data: context, ariaLabel: $localize`Filters` });
  }

  /** Resets the sort (`sort`) or drops one stock (its t212Ticker). */
  protected remove(key: string): void {
    if (key === 'sort') {
      this.sort.set(DEFAULT_TRADE_SORT);
      return;
    }
    const filters = this.filters();
    this.filtersChange.emit({ ...filters, tickers: filters.tickers.filter((t) => t !== key) });
  }

  protected setSide(value: string): void {
    this.filtersChange.emit({
      ...this.filters(),
      side: value === 'ALL' ? null : (value as T212Side),
    });
  }

  /**
   * Stocks to ask for: the selected ones narrowed by the search (matched against the stocks traded in the period),
   * or null for all; an empty list means nothing can match.
   */
  private readonly tickers = computed<string[] | null>(() => {
    const selected = this.filters().tickers;
    const q = this.search().trim();
    if (!q) return selected.length ? selected : null;
    if (!this.instrumentList.hasValue()) return null;
    return filterInstruments(this.instrumentList.value().items, q)
      .map((i) => i.t212Ticker)
      .filter((t) => !selected.length || selected.includes(t))
      .slice(0, 50);
  });

  private readonly query = computed<T212TradesQuery | null>(() => {
    const tickers = this.tickers();
    if (tickers?.length === 0) return null;
    return {
      ...periodQuery(this.period()),
      side: this.filters().side,
      ticker: tickers?.join(',') || null,
      limit: this.sort() === 'newest' ? PAGE_SIZE : 100,
    };
  });

  /** Sorts other than newest first wait for the whole period. */
  protected readonly ready = computed(
    () => this.state().loaded && (this.sort() === 'newest' || !this.state().next),
  );

  protected readonly filtered = computed(
    () => !!this.filters().side || this.filters().tickers.length > 0 || !!this.search().trim(),
  );

  /** Day sections when sorted by date; one section without a date otherwise. */
  protected readonly days = computed<{ date: string | null; items: T212Trade[] }[]>(() => {
    const items = this.state().items;
    switch (this.sort()) {
      case 'newest':
        return groupTradesByDay(items);
      case 'oldest':
        return groupTradesByDay([...items].reverse());
      case 'value':
        return [{ date: null, items: [...items].sort((a, b) => b.value - a.value) }];
      case 'result':
        return [
          {
            date: null,
            items: [...items].sort(
              (a, b) =>
                (b.realizedPnl ?? -Infinity) - (a.realizedPnl ?? -Infinity) || b.value - a.value,
            ),
          },
        ];
    }
  });

  protected readonly emptyText = computed(() =>
    this.filtered()
      ? $localize`No trades match the filters in this period.`
      : $localize`Trades of this period appear here.`,
  );

  constructor() {
    effect(() => {
      const query = this.query();
      this.version();
      this.t212.dataVersion();
      this.localVersion();
      untracked(() => this.loadFirst(query));
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected reload(): void {
    this.localVersion.update((v) => v + 1);
  }

  protected loadMore(): void {
    const s = this.state();
    const query = this.query();
    if (!query || !s.next || s.loading) return;
    this.fetch({ ...query, cursor: s.next }, true);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.filtersChange.emit({ side: null, tickers: [] });
  }

  protected ticker(trade: T212Trade): string {
    return displayTicker(trade);
  }

  private loadFirst(query: T212TradesQuery | null): void {
    this.request?.unsubscribe();
    if (!query) {
      this.state.set({ ...EMPTY, loading: false, loaded: true });
      return;
    }
    this.state.set(EMPTY);
    this.fetch(query, false);
  }

  private fetch(query: T212TradesQuery, append: boolean): void {
    this.request?.unsubscribe();
    this.state.update((s) => ({ ...s, loading: true, error: null }));
    this.request = this.api.t212Trades(query).subscribe({
      next: (page) => {
        this.state.update((s) => ({
          items: append ? [...s.items, ...page.items] : page.items,
          next: page.nextCursor,
          loading: false,
          error: null,
          currency: page.accountCurrency,
          stale: page.stale,
          asOf: page.asOf,
          loaded: true,
        }));
        if (page.nextCursor && this.sort() !== 'newest') {
          this.fetch({ ...query, cursor: page.nextCursor }, true);
        }
      },
      error: (error: unknown) => this.state.update((s) => ({ ...s, loading: false, error })),
    });
  }
}
