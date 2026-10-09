import { AccountCurrencyPipe } from '../../shared/pipes/format.pipes';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api/api.service';
import { T212Holding, T212HoldingPosition } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { FilterButton } from '../../shared/components/filter-button/filter-button';
import { Icon } from '../../shared/icon/icon';
import {
  DEFAULT_HOLDINGS_VIEW,
  HoldingsFilterContext,
  HoldingsFilterSheet,
  HoldingsView,
} from './holdings-filters';
import { SORT_LABELS } from './portfolio-labels';
import {
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass, toneOf } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { displayTicker } from './portfolio-model';
import { PositionDialog, PositionDialogData } from './position-dialog';
import { DIALOG_CONFIG } from '../../shared/components/dialog/dialog';
import { UnrealizedSheet, UnrealizedSheetData } from '../stock-detail/sections/unrealized-sheet';

/**
 * Open positions as Trading 212 lists them, largest value first. A pie is one row; tapping it expands its
 * instruments in place. Tapping a position opens its unrealized profit/loss in a dialog. The card collapses to
 * its title; the choice is remembered.
 */
@Component({
  selector: 'app-portfolio-holdings',
  imports: [
    AccountCurrencyPipe,
    NgTemplateOutlet,
    ErrorState,
    Skeleton,
    StockLogo,
    Icon,
    FilterButton,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
    PercentPipe,
  ],
  template: `
    <div class="app-card" [class.pb-1.5]="open()">
      <h2 class="m-0">
        <button
          type="button"
          class="-m-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-2xl p-2 text-left hover:bg-surface-container-high"
          [attr.aria-expanded]="open()"
          aria-controls="holdings-content"
          (click)="open.set(!open())"
        >
          <span class="app-title-card min-w-0 flex-1" i18n>Open positions</span>
          <app-icon
            name="keyboard_arrow_down"
            class="text-on-surface-variant transition-transform duration-200"
            [class.rotate-180]="open()"
          />
        </button>
      </h2>
      @if (open()) {
        <div id="holdings-content">
          @if (accountValue() !== null) {
            <div class="mt-3.5 space-y-2">
              <div class="rounded-2xl bg-surface-container-high px-3.5 py-3">
                <p class="app-label" i18n>Account value</p>
                <p
                  class="mt-1 text-[22px] font-semibold leading-tight tabular-nums [overflow-wrap:anywhere]"
                >
                  {{ accountValue() | price: (currency() | acct) }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="min-w-0 rounded-2xl bg-surface-container-high px-3.5 py-2.5">
                  <p class="app-label" i18n="Money in the account that is not invested">Cash</p>
                  <p class="mt-1 text-[13px] font-semibold tabular-nums [overflow-wrap:anywhere]">
                    {{ cash() | price: (currency() | acct) }}
                  </p>
                </div>
                <div
                  class="min-w-0 rounded-2xl px-3.5 py-2.5"
                  [class]="unrealizedTile(unrealizedPnl())"
                >
                  <p class="app-label" i18n="Unrealized profit or loss of open positions">
                    Unrealized
                  </p>
                  <p class="mt-1 text-[13px] font-semibold tabular-nums [overflow-wrap:anywhere]">
                    {{ unrealizedPnl() | money: (currency() | acct) }}
                  </p>
                </div>
              </div>
            </div>
          }
          <div class="mt-3.5 flex items-center gap-2">
            <label
              class="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] bg-surface-container-high px-3.5 text-on-surface-variant"
            >
              <app-icon name="search" [size]="18" />
              <input
                type="search"
                class="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant"
                placeholder="Search the portfolio"
                i18n-placeholder
                aria-label="Search the portfolio"
                i18n-aria-label
                [value]="search()"
                (input)="search.set($any($event.target).value)"
              />
            </label>
            <app-filter-button raised [active]="sortChip() !== null" (pressed)="openFilters()" />
          </div>
          @if (sortChip(); as chip) {
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="app-filter-chip"
                [attr.aria-label]="chip.removeLabel"
                (click)="view.set(defaultView)"
              >
                {{ chip.label }}
                <app-icon name="close" [size]="14" />
              </button>
            </div>
          }
          @if (data.error() && !data.hasValue()) {
            <app-error-state [error]="data.error()" (retry)="data.reload()" />
          } @else if (!data.hasValue()) {
            <div class="space-y-3 py-3" aria-hidden="true">
              @for (i of [1, 2, 3, 4]; track i) {
                <app-skeleton shape="card" class="block h-12" />
              }
            </div>
          } @else {
            @let d = data.value();
            @if (!d.items.length) {
              <p class="py-4 text-center text-sm text-on-surface-variant" i18n>
                No open positions.
              </p>
            } @else if (!items().length) {
              <p class="py-4 text-center text-sm text-on-surface-variant" i18n>
                No matching stocks.
              </p>
            }
            <ul class="mt-1">
              @for (h of items(); track key(h)) {
                <li>
                  @if (h.kind === 'PIE') {
                    @let pie = h.pie;
                    @let open = expanded().has(key(h)) || !!search();
                    <button
                      type="button"
                      class="-mx-2 flex w-[calc(100%+16px)] items-center gap-3.5 rounded-2xl px-2 py-3.5 text-left hover:bg-surface-container-high"
                      [attr.aria-expanded]="open"
                      [attr.aria-controls]="'pie-' + key(h)"
                      (click)="toggle(key(h))"
                    >
                      <span
                        class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary"
                      >
                        <app-icon name="pie_chart" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate app-row-title">
                          @if (pie.name) {
                            {{ pie.name }}
                          } @else {
                            <ng-container i18n="Trading 212 pie without a known name"
                              >Pie</ng-container
                            >
                          }
                        </span>
                        <span class="mt-0.5 flex items-center gap-1 app-row-meta whitespace-nowrap">
                          <ng-container i18n>{pie.positions.length, plural,
                            =1 {1 holding}
                            other {{{pie.positions.length}} holdings}
                          }</ng-container>
                          <app-icon
                            name="keyboard_arrow_down"
                            [size]="16"
                            [strokeWidth]="2.2"
                            class="transition-transform"
                            [class.rotate-180]="open"
                          />
                        </span>
                      </span>
                      <ng-container
                        [ngTemplateOutlet]="amounts"
                        [ngTemplateOutletContext]="{
                          value: pie.value,
                          pnl: pie.pnl,
                          pct: pie.pnlPct,
                          currency: d.accountCurrency,
                        }"
                      />
                    </button>
                    @if (open) {
                      <ul [id]="'pie-' + key(h)" class="ml-5 pl-2">
                        @for (p of pie.positions; track p.t212Ticker) {
                          <li>
                            <ng-container
                              [ngTemplateOutlet]="row"
                              [ngTemplateOutletContext]="{
                                $implicit: p,
                                currency: d.accountCurrency,
                              }"
                            />
                          </li>
                        }
                      </ul>
                    }
                  } @else {
                    <ng-container
                      [ngTemplateOutlet]="row"
                      [ngTemplateOutletContext]="{
                        $implicit: h.position,
                        currency: d.accountCurrency,
                      }"
                    />
                  }
                </li>
              }
            </ul>
            @if (!d.piesAvailable) {
              <p class="mt-2 mb-3 text-xs text-on-surface-variant" i18n>
                Trading 212 did not return the pies, so everything held in pies is shown as one pie.
              </p>
            }
          }
        </div>
      }
    </div>

    <ng-template #row let-p let-currency="currency">
      <button
        type="button"
        class="-mx-2 flex w-[calc(100%+16px)] items-center gap-3.5 rounded-2xl px-2 py-3.5 text-left hover:bg-surface-container-high"
        (click)="openPosition(p)"
      >
        <app-stock-logo [symbol]="ticker(p)" [logoUrl]="p.logoUrl" [size]="40" />
        <span class="min-w-0 flex-1">
          <span class="block truncate app-row-title">{{ p.name }}</span>
          <span class="mt-0.5 block truncate app-row-meta uppercase"
            >{{ p.quantity | qty }} {{ ticker(p) }}</span
          >
        </span>
        <ng-container
          [ngTemplateOutlet]="amounts"
          [ngTemplateOutletContext]="{ value: p.value, pnl: p.pnl, pct: p.pnlPct, currency }"
        />
      </button>
    </ng-template>

    <ng-template #amounts let-value="value" let-pnl="pnl" let-pct="pct" let-currency="currency">
      <span class="flex shrink-0 flex-col items-end text-right">
        <span class="text-[14px] font-semibold">{{ value | price: (currency | acct) }}</span>
        <span class="mt-0.5 text-[13px] font-medium" [class]="tone(pnl)"
          >{{ pnl | money: (currency | acct) }} ({{ pct | pct }})</span
        >
      </span>
    </ng-template>
  `,
})
export class PortfolioHoldings {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);
  protected readonly open = persistedSignal('portfolio.holdings.expanded', true);
  readonly currency = input<string | null>(null);
  readonly accountValue = input<number | null>(null);
  readonly cash = input<number | null>(null);
  readonly unrealizedPnl = input<number | null>(null);

  protected readonly search = signal('');
  protected readonly view = persistedSignal<HoldingsView>(
    'portfolio.holdings.view',
    DEFAULT_HOLDINGS_VIEW,
  );
  protected readonly defaultView = DEFAULT_HOLDINGS_VIEW;

  /** A chip while the sort differs from the default; removing it resets the sort. */
  protected readonly sortChip = computed(() => {
    const { sort, direction } = this.view();
    if (sort === DEFAULT_HOLDINGS_VIEW.sort && direction === DEFAULT_HOLDINGS_VIEW.direction) {
      return null;
    }
    const order =
      direction === 'desc'
        ? $localize`:Sort direction|Largest first:Descending`
        : $localize`:Sort direction|Smallest first:Ascending`;
    const label = `${SORT_LABELS[sort]} · ${order}`;
    return { label, removeLabel: $localize`Remove filter ${label}:filter:` };
  });

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly data = rxResource({
    params: () => ({ version: this.version() + this.t212.dataVersion() }),
    stream: () => this.api.t212Holdings(),
  });

  /** The holdings matching the search (name or ticker); a pie stays when any of its positions matches. */
  protected readonly items = computed(() => {
    if (!this.data.hasValue()) return [];
    const query = this.search().trim().toLowerCase();
    const matches = (p: T212HoldingPosition) =>
      !query ||
      p.name.toLowerCase().includes(query) ||
      this.ticker(p).toLowerCase().includes(query);
    const { sort, direction } = this.view();
    const sign = direction === 'desc' ? -1 : 1;
    // Missing amounts go last either way.
    const compare = (a: number | null, b: number | null) =>
      a === null ? (b === null ? 0 : 1) : b === null ? -1 : sign * (a - b);
    const byPosition = (a: T212HoldingPosition, b: T212HoldingPosition) =>
      compare(a[sort], b[sort]);
    const amount = (h: T212Holding) => (h.kind === 'PIE' ? h.pie[sort] : h.position[sort]);
    return this.data
      .value()
      .items.flatMap((h): T212Holding[] => {
        if (h.kind === 'POSITION') return matches(h.position) ? [h] : [];
        const positions = h.pie.positions.filter(matches).sort(byPosition);
        return positions.length ? [{ ...h, pie: { ...h.pie, positions } }] : [];
      })
      .sort((a, b) => compare(amount(a), amount(b)));
  });

  constructor() {
    // Positions change with prices: refetch quietly every minute, keep showing the old value on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        this.t212.trackLive(firstValueFrom(this.api.t212Holdings({ force: true }))).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }

  protected openFilters(): void {
    const context: HoldingsFilterContext = {
      view: this.view(),
      change: (view) => this.view.set(view),
    };
    this.dialog.open(HoldingsFilterSheet, {
      ...DIALOG_CONFIG,
      data: context,
      ariaLabel: $localize`Filters`,
    });
  }

  protected key(h: T212Holding): string {
    return h.kind === 'PIE' ? `pie-${h.pie.id ?? 'grouped'}` : h.position.t212Ticker;
  }

  protected toggle(key: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** Opens the unrealized profit/loss dialog; the position dialog if the instrument cannot be loaded. */
  protected async openPosition(p: T212HoldingPosition): Promise<void> {
    try {
      const { instrument, accountCurrency } = await firstValueFrom(
        this.api.t212Instrument(p.t212Ticker),
      );
      const data: UnrealizedSheetData = { instrument, accountCurrency };
      this.dialog.open(UnrealizedSheet, { ...DIALOG_CONFIG, data });
    } catch {
      this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
        data: { t212Ticker: p.t212Ticker },
        ...DIALOG_CONFIG,
      });
    }
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** Tinted by the sign: green for a gain, red for a loss, grey at zero. */
  protected unrealizedTile(value: number | null): string {
    switch (toneOf(value)) {
      case 'gain':
        return 'bg-gain-container text-gain';
      case 'loss':
        return 'bg-loss-container text-loss';
      default:
        return 'bg-surface-container-high';
    }
  }

  protected ticker(p: T212HoldingPosition): string {
    return displayTicker(p);
  }
}
