import { Component, computed, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { T212Trade } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { Icon } from '../../shared/icon/icon';
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
    MatIconButton,
    StockLogo,
    Icon,
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
    <div class="max-h-[90dvh] overflow-y-auto p-4">
      <div class="flex items-center gap-3">
        <app-stock-logo [symbol]="ticker()" [size]="44" />
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-lg font-bold">{{ t.name }}</h2>
          <p class="text-sm text-on-surface-variant">
            {{ label() }} · {{ ticker() }} · {{ t.executedAt | dateTime }}
          </p>
        </div>
        <button matIconButton type="button" aria-label="Close" i18n-aria-label (click)="close()">
          <app-icon name="close" />
        </button>
      </div>

      <p class="mt-5 app-label" i18n="Total value of a trade">Value</p>
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

      <div class="mt-4 flex flex-wrap justify-end gap-2">
        @if (t.symbol) {
          <a matButton [routerLink]="['/stock', t.symbol]" (click)="close()" i18n
            >Open stock detail</a
          >
        }
        <button matButton="tonal" type="button" (click)="openPosition()" i18n>
          Whole position
        </button>
      </div>
    </div>
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
      data: { t212Ticker: this.data.trade.t212Ticker, period: this.data.period },
      width: 'calc(100vw - 32px)',
      maxWidth: '32rem',
      autoFocus: 'dialog',
    });
  }

  protected close(): void {
    this.ref.close();
  }
}
