import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { T212Trade } from '../../core/models/contract';
import { Dialog } from '../../shared/components/dialog/dialog';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { DateTimePipe, NumberPipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import { PortfolioPeriod, displayTicker } from './portfolio-model';

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
      <app-hero-amount class="mt-1" size="md" [value]="valueBeforeFees()" [currency]="data.currency" />
      <dl appStatList card class="mt-3.5">
        <div appStatRow label="Shares" i18n-label>{{ t.quantity | qty }}</div>
        <div appStatRow label="Price per share" i18n-label>
          {{ t.price | price: t.priceCurrency }}
        </div>
        @if (t.fxRate !== null && t.fxRate !== 1) {
          <div appStatRow label="Exchange rate" i18n-label>{{ t.fxRate | num: 4 }}</div>
        }
        <div appStatRow label="Including fees" i18n-label term="includingFees">
          {{ t.value | price: data.currency }}
        </div>
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
    </app-dialog>
  `,
})
export class TradeDialog {
  protected readonly data = inject<TradeDialogData>(MAT_DIALOG_DATA);

  protected readonly orderLabels = ORDER_LABELS;
  protected readonly ticker = computed(() => displayTicker(this.data.trade));
  protected readonly label = computed(() => {
    const t = this.data.trade;
    return t.kind === 'TRADE' ? SIDE_LABELS[t.side] : KIND_LABELS[t.kind];
  });

  /**
   * The value before fees and taxes. Trading 212's value includes them: paid on top of a buy, deducted from a sell.
   * The "Including fees" row shows the value as it is.
   */
  protected readonly valueBeforeFees = computed(() => {
    const t = this.data.trade;
    const fees = t.fees + t.taxes;
    return Math.round((t.side === 'BUY' ? t.value - fees : t.value + fees) * 100) / 100;
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

}
