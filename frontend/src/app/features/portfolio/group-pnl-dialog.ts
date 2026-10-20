import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { T212Group, T212GroupTrade } from '../../core/models/contract';
import { Dialog } from '../../shared/components/dialog/dialog';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import {
  AccountCurrencyPipe,
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { Pnl } from './pnl';
import { displayTicker } from './portfolio-model';

export interface GroupPnlDialogData {
  kind: 'unrealized' | 'realized';
  group: T212Group;
  /** All the group's trades. */
  trades: T212GroupTrade[];
  /** Account currency of the amounts. */
  currency: string | null;
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
}

/**
 * Opened from the Unrealized or Realized row on a group's page: that profit/loss split by stock, at the group's own
 * average price. Unrealized lists the shares the group holds now; realized every stock it sold, also those it no
 * longer holds. Best result first.
 */
@Component({
  selector: 'app-group-pnl-dialog',
  imports: [
    AccountCurrencyPipe,
    Dialog,
    StockLogo,
    Pnl,
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
            <li class="flex items-center gap-3.5 py-2.5">
              <app-stock-logo [symbol]="ticker(r)" [logoUrl]="r.logoUrl" [size]="40" />
              <span class="min-w-0 flex-1">
                <span class="block truncate app-row-title">{{ r.name }}</span>
                <span class="mt-0.5 block truncate app-row-meta">
                  @if (data.kind === 'unrealized') {
                    <span class="uppercase">{{ r.count | qty }} {{ ticker(r) }}</span> ·
                    {{ r.value | price: currency }}
                  } @else {
                    <span class="uppercase">{{ ticker(r) }}</span> ·
                    <ng-container i18n>{r.count, plural,
                      =1 {1 sell}
                      other {{{r.count}} sells}
                    }</ng-container>
                  }
                </span>
              </span>
              <span class="flex shrink-0 flex-col items-end text-right">
                <span class="text-[15px] font-semibold" [class]="tone(r.pnl)">{{
                  r.pnl | money: currency
                }}</span>
                @if (data.kind === 'unrealized') {
                  <span class="mt-0.5 text-[13px] font-medium" [class]="tone(r.pnl)">{{
                    r.pct | pct
                  }}</span>
                }
              </span>
            </li>
          }
        </ul>
      }
    </app-dialog>
  `,
})
export class GroupPnlDialog {
  protected readonly data = inject<GroupPnlDialogData>(MAT_DIALOG_DATA);

  protected readonly title =
    this.data.kind === 'unrealized'
      ? $localize`:Dialog title, a group's unrealized profit/loss by stock:Unrealized`
      : $localize`:Dialog title, a group's realized profit/loss by stock:Realized`;

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
      };
      row.pnl = Math.round(((row.pnl ?? 0) + (t.groupRealizedPnl ?? 0)) * 100) / 100;
      row.count++;
      byTicker.set(t.t212Ticker, row);
    }
    return [...byTicker.values()];
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected ticker(r: Row): string {
    return displayTicker(r);
  }
}
