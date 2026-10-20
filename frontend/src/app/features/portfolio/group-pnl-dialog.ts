import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { T212Group, T212GroupTrade } from '../../core/models/contract';
import { DIALOG_CONFIG, Dialog } from '../../shared/components/dialog/dialog';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import {
  AccountCurrencyPipe,
  AppDatePipe,
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { Pnl } from './pnl';
import { displayTicker } from './portfolio-model';
import { TradeDialog, TradeDialogData } from './trade-dialog';

export interface GroupPnlDialogData {
  kind: 'unrealized' | 'realized';
  group: T212Group;
  /** All the group's trades. */
  trades: T212GroupTrade[];
  /** Account currency of the amounts. */
  currency: string | null;
  /** Called after a sell opened from here moved to another group (or out of one). */
  groupChanged?: () => void;
}

interface Row {
  t212Ticker: string;
  symbol: string | null;
  name: string;
  logoUrl: string | null;
  pnl: number | null;
  /** Unrealized only. */
  pct: number | null;
  /** Unrealized: shares held. Realized: number of sells. */
  count: number;
  /** Unrealized: current value. */
  value: number | null;
  /** Realized: the stock's sells, newest first. */
  sells: T212GroupTrade[];
}

/**
 * Opened from the Unrealized or Realized row on a group's page: that profit/loss split by stock, at the group's own
 * average price. Unrealized lists the shares the group holds now; realized every stock it sold, also those it no
 * longer holds, and each stock expands to its sells, which open the trade. Best result first.
 */
@Component({
  selector: 'app-group-pnl-dialog',
  imports: [
    AccountCurrencyPipe,
    Dialog,
    StockLogo,
    Icon,
    Pnl,
    AppDatePipe,
    PercentPipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
  ],
  template: `
    @let currency = data.currency | acct;
    <app-dialog [title]="title" [subtitle]="data.group.name">
      <p class="app-label">
        @if (data.kind === 'unrealized') {
          <ng-container i18n="Unrealized profit/loss of a whole group"
            >Unrealized in total</ng-container
          >
        } @else {
          <ng-container i18n="Realized profit/loss of a whole group"
            >Realized in total</ng-container
          >
        }
      </p>
      <p class="mt-1 text-[22px] font-semibold">
        <app-pnl [value]="total()" [currency]="currency" strong />
      </p>

      @if (!rows().length) {
        <p class="mt-4 app-card text-sm text-on-surface-variant">
          @if (data.kind === 'unrealized') {
            <ng-container i18n>The group holds no shares now.</ng-container>
          } @else {
            <ng-container i18n>The group has sold nothing yet.</ng-container>
          }
        </p>
      } @else {
        <ul class="mt-4 app-card py-1">
          @for (r of rows(); track r.t212Ticker) {
            <li>
              @if (data.kind === 'unrealized') {
                <div class="flex items-center gap-3.5 py-2.5">
                  <app-stock-logo [symbol]="ticker(r)" [logoUrl]="r.logoUrl" [size]="40" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate app-row-title">{{ r.name }}</span>
                    <span class="mt-0.5 block truncate app-row-meta">
                      <span class="uppercase">{{ r.count | qty }} {{ ticker(r) }}</span> ·
                      {{ r.value | price: currency }}
                    </span>
                  </span>
                  <span class="flex shrink-0 flex-col items-end text-right">
                    <span class="text-[15px] font-semibold" [class]="tone(r.pnl)">{{
                      r.pnl | money: currency
                    }}</span>
                    <span class="mt-0.5 text-[13px] font-medium" [class]="tone(r.pnl)">{{
                      r.pct | pct
                    }}</span>
                  </span>
                </div>
              } @else {
                @let open = expanded().has(r.t212Ticker);
                <button
                  type="button"
                  class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-container-high"
                  [attr.aria-expanded]="open"
                  [attr.aria-controls]="'sells-' + r.t212Ticker"
                  (click)="toggle(r.t212Ticker)"
                >
                  <app-stock-logo [symbol]="ticker(r)" [logoUrl]="r.logoUrl" [size]="40" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate app-row-title">{{ r.name }}</span>
                    <span class="mt-0.5 flex items-center gap-1 app-row-meta whitespace-nowrap">
                      <span class="min-w-0 truncate">
                        <span class="uppercase">{{ ticker(r) }}</span> ·
                        <ng-container i18n>{r.count, plural,
                          =1 {1 sell}
                          other {{{r.count}} sells}
                        }</ng-container>
                      </span>
                      <app-icon
                        name="keyboard_arrow_down"
                        [size]="16"
                        [strokeWidth]="2.2"
                        class="shrink-0 transition-transform"
                        [class.rotate-180]="open"
                      />
                    </span>
                  </span>
                  <span class="shrink-0 text-[15px] font-semibold" [class]="tone(r.pnl)">{{
                    r.pnl | money: currency
                  }}</span>
                </button>
                @if (open) {
                  <ul [id]="'sells-' + r.t212Ticker" class="ml-5 pl-2">
                    @for (t of r.sells; track t.id) {
                      <li>
                        <button
                          type="button"
                          class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-container-high"
                          (click)="openTrade(t)"
                        >
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-[14px] font-semibold">{{
                              t.executedAt | appDate
                            }}</span>
                            <span class="mt-0.5 flex items-center gap-1 app-row-meta">
                              @if (t.oversold) {
                                <app-icon name="warning" [size]="14" class="shrink-0 text-error" />
                                <span class="sr-only" i18n
                                  >Sells more shares than the group held</span
                                >
                              }
                              <span class="min-w-0 truncate">
                                {{ t.quantity | qty }}
                                @if (t.price !== null) {
                                  × {{ t.price | price: t.priceCurrency }}
                                }
                              </span>
                            </span>
                          </span>
                          <span
                            class="shrink-0 text-[14px] font-medium"
                            [class]="tone(t.groupRealizedPnl)"
                            >{{ t.groupRealizedPnl | money: currency }}</span
                          >
                          <app-icon
                            name="chevron_right"
                            [size]="18"
                            class="shrink-0 text-on-surface-variant"
                          />
                        </button>
                      </li>
                    }
                  </ul>
                }
              }
            </li>
          }
        </ul>
      }
    </app-dialog>
  `,
})
export class GroupPnlDialog {
  protected readonly data = inject<GroupPnlDialogData>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<GroupPnlDialog>);

  protected readonly title =
    this.data.kind === 'unrealized'
      ? $localize`:Dialog title, a group's unrealized profit/loss by stock:Unrealized`
      : $localize`:Dialog title, a group's realized profit/loss by stock:Realized`;

  /** Realized: the stocks whose sells are shown. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly total = computed(() =>
    this.data.kind === 'unrealized' ? this.data.group.unrealizedPnl : this.data.group.realizedPnl,
  );

  protected readonly rows = computed<Row[]>(() => {
    const { kind, group, trades } = this.data;
    const rows: Row[] =
      kind === 'unrealized'
        ? group.holdings.map((h) => ({
            t212Ticker: h.t212Ticker,
            symbol: h.symbol,
            name: h.name,
            logoUrl: h.logoUrl,
            pnl: h.unrealizedPnl,
            pct: h.unrealizedPnlPct,
            count: h.quantity,
            value: h.value,
            sells: [],
          }))
        : this.realizedRows(group, trades);
    return rows.sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity));
  });

  /** One row per stock the group sold, summing its sells' results at the group's average price. */
  private realizedRows(group: T212Group, trades: T212GroupTrade[]): Row[] {
    const logos = new Map(group.holdings.map((h) => [h.t212Ticker, h.logoUrl]));
    const byTicker = new Map<string, Row>();
    for (const t of trades) {
      if (t.side !== 'SELL') continue;
      const row = byTicker.get(t.t212Ticker) ?? {
        t212Ticker: t.t212Ticker,
        symbol: t.symbol,
        name: t.name,
        logoUrl: logos.get(t.t212Ticker) ?? null,
        pnl: 0,
        pct: null,
        count: 0,
        value: null,
        sells: [],
      };
      row.pnl = Math.round(((row.pnl ?? 0) + (t.groupRealizedPnl ?? 0)) * 100) / 100;
      row.count++;
      row.sells.push(t);
      byTicker.set(t.t212Ticker, row);
    }
    for (const row of byTicker.values()) {
      row.sells.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    }
    return [...byTicker.values()];
  }

  protected toggle(ticker: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(ticker)) next.add(ticker);
      return next;
    });
  }

  /** The sell's own dialog, over this one. Moving it out of the group closes this list, as its totals change. */
  protected openTrade(trade: T212GroupTrade): void {
    this.dialog.open<TradeDialog, TradeDialogData>(TradeDialog, {
      ...DIALOG_CONFIG,
      data: {
        trade,
        currency: this.data.currency,
        groupChanged: () => {
          this.dialogRef.close();
          this.data.groupChanged?.();
        },
      },
    });
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected ticker(r: Row): string {
    return displayTicker(r);
  }
}
