import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { T212DetailTrade, T212Instrument } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { Dialog } from '../../shared/components/dialog/dialog';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import {
  AccountCurrencyPipe,
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { assignTrades } from './group-dialogs';
import { SIDE_LABELS } from './portfolio-labels';
import { dayIn, displayTicker, filterInstruments } from './portfolio-model';
import { TradeTile } from './trade-tile';

/** What the trades step shows of the stock. */
type TradesStock = Pick<T212Instrument, 't212Ticker' | 'symbol' | 'name' | 'logoUrl'>;

export interface GroupTradesDialogData {
  groupId: string;
  groupName: string;
  currency: string | null;
  /** Opens on this stock, without the stock list or a way back to it. */
  stock?: TradesStock;
  /** How many trades of each stock (by t212Ticker) the group already has; those stocks lead the list. */
  inGroup?: Readonly<Record<string, number>>;
}

/**
 * Chooses the trades of a group, one stock at a time: first the stock, then its buys and sells with a checkbox each
 * (ticked = in this group). A trade in another group shows that group and moves here when ticked. Closes with true
 * once something was saved.
 */
@Component({
  selector: 'app-group-trades-dialog',
  imports: [
    AccountCurrencyPipe,
    MatButton,
    MatCheckbox,
    MatDialogClose,
    Dialog,
    ErrorState,
    Skeleton,
    StockLogo,
    Icon,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
    TradeTile,
  ],
  template: `
    <app-dialog
      [title]="labels.title"
      [subtitle]="data.groupName"
      [closeAction]="stock() && !data.stock ? backToStocks : null"
      [closeLabel]="labels.back"
    >
      @if (!stock()) {
        <label
          class="mb-2 flex h-10 items-center gap-2.5 rounded-[14px] bg-surface-container-high px-3.5 text-on-surface-variant"
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
        @if (instruments.error() && !instruments.hasValue()) {
          <app-error-state [error]="instruments.error()" (retry)="instruments.reload()" />
        } @else if (!instruments.hasValue()) {
          <div class="space-y-2 py-2" aria-hidden="true">
            @for (i of [1, 2, 3, 4]; track i) {
              <app-skeleton shape="card" class="block h-12" />
            }
          </div>
        } @else if (!stocks().length) {
          <p class="py-4 text-center text-sm text-on-surface-variant" i18n>No matching stocks.</p>
        } @else {
          <ul class="-mx-2">
            @for (i of stocks(); track i.t212Ticker) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-container-high"
                  (click)="stock.set(i)"
                >
                  <app-stock-logo [symbol]="ticker(i)" [logoUrl]="i.logoUrl" [size]="36" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate app-row-title">{{ i.name }}</span>
                    <span class="block truncate app-row-meta">
                      <span class="uppercase">{{ ticker(i) }}</span> ·
                      <ng-container i18n>{i.tradeCount, plural,
                        =1 {1 trade}
                        other {{{i.tradeCount}} trades}
                      }</ng-container>
                    </span>
                  </span>
                  @if (inGroup(i); as count) {
                    <span
                      class="shrink-0 app-pill bg-primary-container text-primary"
                      i18n="
                        Pill: how many of a stock's trades are already in the group; COUNT is a
                        number
                      "
                      >{{ count }} in group</span
                    >
                  }
                  <app-icon name="chevron_right" class="text-on-surface-variant" />
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        @if (trades.error() && !trades.hasValue()) {
          <app-error-state [error]="trades.error()" (retry)="trades.reload()" />
        } @else if (!trades.hasValue()) {
          <div class="space-y-2 py-2" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <app-skeleton shape="card" class="block h-12" />
            }
          </div>
        } @else {
          @for (d of days(); track d.date) {
            <section class="mt-3 first-of-type:mt-0">
              <h3 class="app-title-day">{{ d.date | appDate: 'long' }}</h3>
              <ul class="-mx-2">
                @for (t of d.items; track t.id) {
                  <li>
                    <mat-checkbox
                      class="trade-option w-full"
                      [checked]="selected().has(t.id)"
                      (change)="toggle(t.id, $event.checked)"
                    >
                      <span class="flex min-w-0 items-center gap-2 py-0.5">
                        <app-trade-tile small [kind]="t.side === 'BUY' ? 'buy' : 'sell'" />
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-[13px] font-semibold">
                            {{ sideLabels[t.side] }} · {{ t.quantity | qty }}
                            @if (t.price !== null) {
                              × {{ t.price | price: t.priceCurrency }}
                            }
                          </span>
                          @if (otherGroup(t); as other) {
                            <span class="block truncate text-[12px] text-on-surface-variant">
                              <ng-container i18n="A trade that is in another group; GROUP is its name"
                                >in {{ other }}</ng-container
                              >
                            </span>
                          }
                        </span>
                        <span class="flex shrink-0 flex-col items-end text-right">
                          <span class="text-[13px] font-semibold">{{
                            t.value | price: (data.currency | acct)
                          }}</span>
                          @if (t.realizedPnl !== null) {
                            <span class="text-[12px] font-medium" [class]="tone(t.realizedPnl)">{{
                              t.realizedPnl | money: (data.currency | acct)
                            }}</span>
                          }
                        </span>
                      </span>
                    </mat-checkbox>
                  </li>
                }
              </ul>
            </section>
          }
        }
      }
      <!-- The stock, and the ticked trades' shares, stay in view while the trades scroll: whether the group would still
           hold some, none, or sell more than it bought. -->
      @if (stock(); as s) {
        <div dialogSubheader class="rounded-2xl bg-surface-container-high px-3 py-2">
          <div class="flex items-center gap-2.5">
            <app-stock-logo [symbol]="ticker(s)" [logoUrl]="s.logoUrl" [size]="32" />
            <span class="min-w-0 flex-1">
              <span class="block truncate app-title-card">{{ s.name }}</span>
              <span class="block truncate app-row-meta uppercase">{{ ticker(s) }}</span>
            </span>
            @if (stockTrades().length) {
              <button matButton type="button" class="-my-1 -mr-2 shrink-0" (click)="toggleAll()">
                @if (allSelected()) {
                  <ng-container i18n="Button: untick every trade of the stock">Deselect all</ng-container>
                } @else {
                  <ng-container i18n="Button: tick every trade of the stock">Select all</ng-container>
                }
              </button>
            }
          </div>
          <div aria-live="polite">
            @if (balance(); as b) {
              <div class="mt-2 flex items-center gap-3 border-t border-outline-variant pt-2">
                @if (b.state === 'even') {
                  <span class="min-w-0 flex-1 truncate text-[12px] text-on-surface-variant">
                    <span i18n="Realized profit/loss of the ticked trades">Realized</span>
                    <span class="ml-1 text-[13px] font-semibold" [class]="tone(b.pnl)">{{
                      b.pnl | money: (data.currency | acct)
                    }}</span>
                  </span>
                } @else {
                  <span class="min-w-0 flex-1 text-[12px] text-on-surface-variant">
                    <span
                      class="whitespace-nowrap"
                      i18n="Shares bought by the ticked trades; COUNT is a number"
                      >Bought {{ b.bought | qty }}</span
                    >
                    ·
                    <span
                      class="whitespace-nowrap"
                      i18n="Shares sold by the ticked trades; COUNT is a number"
                      >Sold {{ b.sold | qty }}</span
                    >
                  </span>
                }
                @switch (b.state) {
                  @case ('over') {
                    <span
                      class="app-pill shrink-0 bg-error-container text-on-error-container"
                      i18n="Pill: the ticked trades sell more shares than they buy; COUNT is a number"
                      >{{ b.net | qty }} more sold</span
                    >
                  }
                  @case ('under') {
                    <span
                      class="app-pill shrink-0 bg-primary-container text-primary"
                      i18n="Pill: shares the ticked trades bought and not sold yet; COUNT is a number"
                      >{{ b.net | qty }} still held</span
                    >
                  }
                  @default {
                    <span
                      class="app-pill shrink-0 bg-gain-container text-gain"
                      i18n="Pill: the ticked trades sell exactly the shares they buy"
                      >All sold</span
                    >
                  }
                }
              </div>
            }
          </div>
        </div>
      }
      <!-- One element per block: a block with a single root element is projected into the actions slot. -->
      @if (stock()) {
        <button dialogActions matButton="tonal" type="button" mat-dialog-close>
          <ng-container i18n>Cancel</ng-container>
        </button>
      }
      @if (stock()) {
        <button
          dialogActions
          matButton="filled"
          type="button"
          [disabled]="!changes().count || saving()"
          (click)="save()"
        >
          <ng-container i18n="Button that saves the trades of a group">Save</ng-container>
        </button>
      }
    </app-dialog>
  `,
  styles: `
    .trade-option {
      display: flex;
    }
    .trade-option ::ng-deep .mdc-form-field {
      width: 100%;
    }
    .trade-option ::ng-deep .mdc-label {
      flex: 1 1 auto;
      min-width: 0;
      cursor: pointer;
    }
  `,
})
export class GroupTradesDialog {
  protected readonly data = inject<GroupTradesDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<GroupTradesDialog, boolean>);
  private readonly api = inject(ApiService);
  private readonly notifier = inject(NotifierService);

  protected readonly labels = {
    title: $localize`:Dialog title|Choosing the trades of a group:Trades in the group`,
    back: $localize`Back to the stocks`,
  };
  protected readonly sideLabels = SIDE_LABELS;
  protected readonly search = signal('');
  protected readonly stock = signal<TradesStock | null>(this.data.stock ?? null);
  protected readonly saving = signal(false);
  /** Trade ids ticked for this group, starting from the trades already in it. */
  protected readonly selected = signal<ReadonlySet<string>>(new Set());

  protected readonly instruments = rxResource({
    stream: () => this.api.t212Instruments({ from: null, to: null, tz: 'UTC', status: 'ALL' }),
  });
  private readonly groups = rxResource({ stream: () => this.api.t212Groups() });
  protected readonly trades = rxResource({
    params: () => this.stock()?.t212Ticker,
    stream: ({ params }) => (params ? this.api.t212Instrument(params) : of(null)),
  });

  /** Stocks with trades, narrowed by the search: those with trades in this group first, then A–Z. */
  protected readonly stocks = computed(() =>
    this.instruments.hasValue()
      ? filterInstruments(
          this.instruments.value().items.filter((i) => i.tradeCount > 0),
          this.search(),
        ).sort((a, b) => this.inGroup(b) - this.inGroup(a) || a.name.localeCompare(b.name))
      : [],
  );

  /** The stock's buys and sells (no splits or other corporate actions), newest first. */
  protected readonly stockTrades = computed<T212DetailTrade[]>(() =>
    (this.trades.value()?.trades ?? []).filter((t) => t.kind === 'TRADE'),
  );

  /** The trades by day in the device's zone, newest day first. */
  protected readonly days = computed(() => {
    const days: { date: string; items: T212DetailTrade[] }[] = [];
    for (const t of this.stockTrades()) {
      const date = dayIn(t.executedAt);
      const last = days.at(-1);
      if (last?.date === date) last.items.push(t);
      else days.push({ date, items: [t] });
    }
    return days;
  });

  /**
   * Shares bought and sold by the ticked trades, and the difference (`net`, never negative): `over` sells more than it
   * buys, `under` still holds some, `even` sells them all (with the backend's tolerance for fractional shares).
   */
  protected readonly balance = computed(() => {
    const selected = this.selected();
    let bought = 0;
    let sold = 0;
    // Proceeds minus cost, both before fees, as the group counts them (only shown once everything is sold).
    let pnl = 0;
    for (const t of this.stockTrades()) {
      if (!selected.has(t.id)) continue;
      if (t.side === 'BUY') {
        bought += t.quantity;
        pnl -= Math.max(0, t.value - t.fees - t.taxes);
      } else {
        sold += t.quantity;
        pnl += t.value + t.fees + t.taxes;
      }
    }
    if (!bought && !sold) return null;
    const diff = bought - sold;
    const tolerance = Math.max(bought, sold) * 1e-6 + 1e-9;
    const state = diff < -tolerance ? 'over' : diff > tolerance ? 'under' : 'even';
    return { bought, sold, net: Math.abs(diff), state, pnl };
  });

  protected readonly changes = computed(() => {
    const selected = this.selected();
    const trades = this.stockTrades();
    const add = trades
      .filter((t) => selected.has(t.id) && t.groupId !== this.data.groupId)
      .map((t) => t.id);
    const remove = trades
      .filter((t) => !selected.has(t.id) && t.groupId === this.data.groupId)
      .map((t) => t.id);
    return { add, remove, count: add.length + remove.length };
  });

  protected readonly groupNames = computed(
    () => new Map((this.groups.value()?.items ?? []).map((g) => [g.id, g.name])),
  );

  constructor() {
    // Each stock starts from the trades already in this group.
    effect(() => {
      const ids = this.stockTrades()
        .filter((t) => t.groupId === this.data.groupId)
        .map((t) => t.id);
      untracked(() => this.selected.set(new Set(ids)));
    });
  }

  protected toggle(id: string, checked: boolean): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected readonly allSelected = computed(() => {
    const selected = this.selected();
    const trades = this.stockTrades();
    return trades.length > 0 && trades.every((t) => selected.has(t.id));
  });

  /** Ticks every trade of the stock, or unticks them all when all are ticked. */
  protected toggleAll(): void {
    this.selected.set(
      this.allSelected() ? new Set() : new Set(this.stockTrades().map((t) => t.id)),
    );
  }

  protected inGroup(i: { t212Ticker: string }): number {
    return this.data.inGroup?.[i.t212Ticker] ?? 0;
  }

  /** The close button on a stock picked from the list: back to the list (the dialog closes from there). */
  protected readonly backToStocks = (): void => this.stock.set(null);

  protected otherGroup(t: T212DetailTrade): string | null {
    if (!t.groupId || t.groupId === this.data.groupId) return null;
    return this.groupNames().get(t.groupId) ?? null;
  }

  /** Adds, then removes; a failed call is reported and keeps the dialog open. */
  protected async save(): Promise<void> {
    const { add, remove } = this.changes();
    this.saving.set(true);
    try {
      if (add.length && !(await assignTrades(this.api, this.notifier, add, this.data.groupId)))
        return;
      // A failed removal keeps the dialog open, unless additions were saved: then the page shows them.
      const removed = !remove.length || (await assignTrades(this.api, this.notifier, remove, null));
      if (removed || add.length) this.ref.close(true);
    } finally {
      this.saving.set(false);
    }
  }

  protected ticker(i: { symbol: string | null; t212Ticker: string }): string {
    return displayTicker(i);
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }
}
