import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { T212Trade } from '../../core/models/contract';
import { DIALOG_CONFIG, Dialog } from '../../shared/components/dialog/dialog';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { DateTimePipe, NumberPipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import { PortfolioPeriod, displayTicker } from './portfolio-model';
import { PositionDialog, PositionDialogData } from './position-dialog';

export interface TradeDialogData {
  trade: T212Trade;
  /** Account currency of the value, fees and profit/loss. */
  currency: string | null;
  /** Passed on to the position dialog. */
  period?: PortfolioPeriod;
}

const ORDER_LABELS: Record<NonNullable<T212Trade['orderType']>, string> = {
  MARKET: $localize`:Order type:Market`,
  LIMIT: $localize`:Order type:Limit`,
  STOP: $localize`:Order type:Stop`,
  STOP_LIMIT: $localize`:Order type:Stop limit`,
};

/** Opened from a row on the Trades tab: that one buy or sell, with a link to the whole position. */
@Component({
  selector: 'app-trade-dialog',
  imports: [
    RouterLink,
    MatButton,
    Dialog,
    StockLogo,
    HeroAmount,
    StatList,
    StatRow,
    Pnl,
    DateTimePipe,
    NumberPipe,
    PricePipe,
    QuantityPipe,
  ],
  template: `
    @let t = data.trade;
    <app-dialog [title]="t.name" [subtitle]="ticker() + ' · ' + (t.executedAt | dateTime)">
      <app-stock-logo dialogLeading [symbol]="ticker()" [size]="44" />
      <span
        dialogTrailing
        class="shrink-0 app-pill"
        [class]="
          t.kind === 'TRADE' && t.side === 'BUY'
            ? 'bg-primary-container text-primary'
            : 'bg-surface-container-high text-on-surface'
        "
        >{{ label() }}</span
      >

      <p class="app-label" i18n="Total value of a trade">Value</p>
      <app-hero-amount class="mt-1" size="md" [value]="t.value" [currency]="data.currency" />
      <dl appStatList card class="mt-3.5">
        <div appStatRow label="Shares" i18n-label>{{ t.quantity | qty }}</div>
        <div appStatRow label="Price per share" i18n-label>
          {{ t.price | price: t.priceCurrency }}
        </div>
        @if (t.fxRate !== null && t.fxRate !== 1) {
          <div appStatRow label="Exchange rate" i18n-label>{{ t.fxRate | num: 4 }}</div>
        }
        <div appStatRow label="Fees" i18n-label>{{ t.fees + t.taxes | price: data.currency }}</div>
        @if (t.realizedPnl !== null) {
          <div
            appStatRow
            total
            label="Result"
            i18n-label="Profit/loss of one sell"
            term="realizedPnl"
          >
            <app-pnl
              [value]="result()"
              [currency]="data.currency"
              [pct]="resultPct() ?? undefined"
            />
          </div>
        }
      </dl>
      <dl appStatList class="mt-1.5">
        <div appStatRow label="Order type" i18n-label>
          {{ t.orderType ? orderLabels[t.orderType] : '—' }}
        </div>
      </dl>

      <button matButton="tonal" dialogActions type="button" (click)="openPosition()" i18n>
        Whole position
      </button>
      @if (t.symbol) {
        <a
          matButton="filled"
          dialogActions
          [routerLink]="['/stock', t.symbol]"
          (click)="close()"
          i18n
          >Stock detail</a
        >
      }
    </app-dialog>
  `,
})
export class TradeDialog {
  private readonly ref = inject(MatDialogRef<TradeDialog>);
  private readonly dialog = inject(MatDialog);
  protected readonly data = inject<TradeDialogData>(MAT_DIALOG_DATA);

  protected readonly orderLabels = ORDER_LABELS;
  protected readonly ticker = computed(() => displayTicker(this.data.trade));
  protected readonly label = computed(() => {
    const t = this.data.trade;
    return t.kind === 'TRADE' ? SIDE_LABELS[t.side] : KIND_LABELS[t.kind];
  });

  /** A sell before its fees and taxes, as in the realized figure on the position detail. */
  protected readonly result = computed(() => {
    const t = this.data.trade;
    return t.realizedPnl === null ? null : t.realizedPnl;
  });
  /** Against the cost of the shares sold (proceeds less the gain). */
  protected readonly resultPct = computed(() => {
    const t = this.data.trade;
    const result = this.result();
    if (result === null || t.realizedPnl === null) return null;
    const cost = t.value - t.realizedPnl;
    return cost > 0 ? Math.round((result / cost) * 10000) / 100 : null;
  });

  protected openPosition(): void {
    this.close();
    this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
      ...DIALOG_CONFIG,
      data: { t212Ticker: this.data.trade.t212Ticker, period: this.data.period },
    });
  }

  protected close(): void {
    this.ref.close();
  }
}
