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
import { Icon } from '../../shared/icon/icon';
import {
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { displayTicker } from './portfolio-model';
import { PositionDialog, PositionDialogData } from './position-dialog';

/**
 * Open positions as Trading 212 lists them, largest value first. A pie is one row; tapping it expands its
 * instruments in place. Tapping a position opens its chart and profit/loss in a dialog. The card collapses to
 * its title and total; the choice is remembered.
 */
@Component({
  selector: 'app-portfolio-holdings',
  imports: [
    NgTemplateOutlet,
    ErrorState,
    Skeleton,
    StockLogo,
    Icon,
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
          <span class="min-w-0 flex-1">
            <span class="app-label block" i18n>Open positions</span>
            @if (total() !== null) {
              <span class="mt-0.5 block text-base font-semibold">{{
                total() | price: currency()
              }}</span>
            }
          </span>
          <app-icon
            name="keyboard_arrow_down"
            class="text-on-surface-variant transition-transform duration-200"
            [class.rotate-180]="open()"
          />
        </button>
      </h2>
      @if (open()) {
        <div id="holdings-content">
          <label
            class="mt-3.5 flex h-[46px] items-center gap-2.5 rounded-[14px] bg-surface-container-high px-3.5 text-on-surface-variant"
          >
            <app-icon name="search" [size]="20" />
            <input
              type="search"
              class="min-w-0 flex-1 bg-transparent text-[15px] text-on-surface outline-none placeholder:text-on-surface-variant"
              placeholder="Search the portfolio"
              i18n-placeholder
              aria-label="Search the portfolio"
              i18n-aria-label
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
          </label>
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
                        <span class="block truncate text-[15px] font-medium">
                          @if (pie.name) {
                            {{ pie.name }}
                          } @else {
                            <ng-container i18n="Trading 212 pie without a known name"
                              >Pie</ng-container
                            >
                          }
                        </span>
                        <span
                          class="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold whitespace-nowrap text-on-surface-variant"
                        >
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
                      <ul [id]="'pie-' + key(h)" class="ml-6 border-l border-outline-variant pl-3">
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
          <span class="block truncate text-[15px] font-medium">{{ p.name }}</span>
          <span
            class="mt-0.5 block truncate text-[12.5px] font-semibold text-on-surface-variant uppercase"
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
        <span class="text-[15px] font-semibold">{{ value | price: currency }}</span>
        <span class="mt-0.5 text-[12.5px] font-medium" [class]="tone(pnl)"
          >{{ pnl | money: currency }} ({{ pct | pct }})</span
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
  /** Value of all open positions, shown in the card's heading. */
  readonly total = input<number | null>(null);
  protected readonly open = persistedSignal('portfolio.holdings.expanded', true);
  readonly currency = input<string | null>(null);

  protected readonly search = signal('');

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly data = rxResource({
    params: () => ({ version: this.version() + this.t212.dataVersion() }),
    stream: () => this.api.t212Holdings(),
  });

  /** The holdings matching the search (name or ticker); a pie stays when any of its positions matches. */
  protected readonly items = computed(() => {
    if (!this.data.hasValue()) return [];
    const items = this.data.value().items;
    const query = this.search().trim().toLowerCase();
    if (!query) return items;
    const matches = (p: T212HoldingPosition) =>
      p.name.toLowerCase().includes(query) || this.ticker(p).toLowerCase().includes(query);
    return items.flatMap((h): T212Holding[] => {
      if (h.kind === 'POSITION') return matches(h.position) ? [h] : [];
      const positions = h.pie.positions.filter(matches);
      return positions.length ? [{ ...h, pie: { ...h.pie, positions } }] : [];
    });
  });

  constructor() {
    // Positions change with prices: refetch quietly every minute, keep showing the old value on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        firstValueFrom(this.api.t212Holdings({ force: true })).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
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

  protected openPosition(p: T212HoldingPosition): void {
    this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
      data: { t212Ticker: p.t212Ticker },
      width: 'calc(100vw - 32px)',
      maxWidth: '32rem',
      autoFocus: 'dialog',
    });
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected ticker(p: T212HoldingPosition): string {
    return displayTicker(p);
  }
}
