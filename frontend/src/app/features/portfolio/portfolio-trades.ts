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
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, T212TradesQuery } from '../../core/api/api.service';
import { T212Trade } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { InView } from '../../shared/directives/in-view';
import { Icon } from '../../shared/icon/icon';
import { AppDatePipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import { PortfolioPeriod, displayTicker, groupTradesByDay, periodQuery } from './portfolio-model';
import {
  InstrumentOption,
  TradeFilters,
  TradeFiltersContext,
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
 * Filters (side, stocks) live in the URL and are edited in a bottom sheet that applies them on Done.
 */
@Component({
  selector: 'app-portfolio-trades',
  imports: [
    RouterLink,
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
          (click)="remove(chip.key)"
        >
          {{ chip.label }}
          <app-icon name="close" [size]="16" />
        </button>
      }
    </div>

    @if (state().error && !state().loaded) {
      <app-error-state [error]="state().error" (retry)="reload()" />
    } @else if (!state().loaded) {
      <div class="space-y-2" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <app-skeleton shape="card" class="h-14" />
        }
      </div>
    } @else {
      @if (state().stale) {
        <div class="mb-3"><app-stale-chip [asOf]="state().asOf" /></div>
      }
      @if (state().items.length === 0) {
        <app-empty-state icon="receipt_long" title="No trades" i18n-title [text]="emptyText()">
          @if (chips().length) {
            <button matButton="outlined" type="button" (click)="clearFilters()" i18n>
              Reset filters
            </button>
          }
        </app-empty-state>
      } @else {
        @for (day of days(); track day.date) {
          <h3 class="sticky-day mt-4 mb-1 px-2 text-xs font-semibold text-on-surface-variant">
            {{ day.date | appDate: 'long' }}
          </h3>
          <ul>
            @for (t of day.items; track t.id) {
              <li>
                <a
                  [routerLink]="['/portfolio', t.t212Ticker]"
                  class="flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-container-high"
                >
                  <span
                    class="w-12 shrink-0 rounded-md py-0.5 text-center text-[11px] font-semibold"
                    [class]="
                      t.kind !== 'TRADE'
                        ? 'bg-surface-container-highest text-on-surface-variant'
                        : t.side === 'BUY'
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-inverse-surface text-inverse-on-surface'
                    "
                    >{{ t.kind === 'TRADE' ? sideLabels[t.side] : kindLabels[t.kind] }}</span
                  >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{ t.name }}</span>
                    <span class="block truncate text-xs text-on-surface-variant">
                      {{ ticker(t) }} · {{ t.quantity | qty }}
                      @if (t.price !== null) {
                        × {{ t.price | price: t.priceCurrency }}
                      }
                    </span>
                  </span>
                  <span class="flex flex-col items-end text-sm">
                    <span class="tabular-nums">{{ t.value | price: state().currency }}</span>
                    @if (t.realizedPnl !== null) {
                      <app-pnl
                        class="text-xs"
                        [value]="t.realizedPnl"
                        [currency]="state().currency"
                      />
                    }
                  </span>
                </a>
              </li>
            }
          </ul>
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
  private readonly sheet = inject(MatBottomSheet);

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

  protected readonly filterContext: TradeFiltersContext = {
    filters: this.filters,
    instruments: this.instruments,
    change: (filters) => this.filtersChange.emit(filters),
  };

  private readonly query = computed<T212TradesQuery>(() => ({
    ...periodQuery(this.period()),
    side: this.filters().side,
    ticker: this.filters().tickers.join(',') || null,
    limit: PAGE_SIZE,
  }));

  protected readonly days = computed(() => groupTradesByDay(this.state().items));

  protected readonly chips = computed(() => {
    const { side, tickers } = this.filters();
    const chips: { key: string; label: string; removeLabel: string }[] = [];
    if (side) {
      chips.push({
        key: 'side',
        label: SIDE_LABELS[side],
        removeLabel: $localize`Remove filter ${SIDE_LABELS[side]}:filter:`,
      });
    }
    for (const ticker of tickers) {
      const option = this.instruments().find((i) => i.t212Ticker === ticker);
      const label = option ? displayTicker(option) : ticker;
      chips.push({ key: ticker, label, removeLabel: $localize`Remove filter ${label}:filter:` });
    }
    return chips;
  });

  protected readonly emptyText = computed(() =>
    this.chips().length
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
    if (!s.next || s.loading) return;
    this.fetch({ ...this.query(), cursor: s.next }, true);
  }

  protected openFilters(): void {
    this.sheet.open(TradesFilterSheet, { data: this.filterContext, ariaLabel: $localize`Filters` });
  }

  /** Removes the side chip (`side`) or one stock chip (its t212Ticker). */
  protected remove(key: string): void {
    const filters = this.filters();
    this.filtersChange.emit(
      key === 'side'
        ? { ...filters, side: null }
        : { ...filters, tickers: filters.tickers.filter((t) => t !== key) },
    );
  }

  protected clearFilters(): void {
    this.filtersChange.emit({ side: null, tickers: [] });
  }

  protected ticker(trade: T212Trade): string {
    return displayTicker(trade);
  }

  private loadFirst(query: T212TradesQuery): void {
    this.state.set(EMPTY);
    this.fetch(query, false);
  }

  private fetch(query: T212TradesQuery, append: boolean): void {
    this.request?.unsubscribe();
    this.state.update((s) => ({ ...s, loading: true, error: null }));
    this.request = this.api.t212Trades(query).subscribe({
      next: (page) =>
        this.state.update((s) => ({
          items: append ? [...s.items, ...page.items] : page.items,
          next: page.nextCursor,
          loading: false,
          error: null,
          currency: page.accountCurrency,
          stale: page.stale,
          asOf: page.asOf,
          loaded: true,
        })),
      error: (error: unknown) => this.state.update((s) => ({ ...s, loading: false, error })),
    });
  }
}
