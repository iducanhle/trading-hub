import { Component, computed, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { T212Trade } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
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
    TermInfo,
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

      <div class="app-card mt-4 block">
        <p class="app-label" i18n="Total value of a trade">Value</p>
        <p class="mt-1 text-xl font-bold tabular-nums">{{ t.value | price: data.currency }}</p>
        <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] font-semibold">
          @if (t.realizedPnl !== null) {
            <div>
              <dt class="app-label flex items-center gap-1 text-[11px]">
                <ng-container i18n="Profit/loss of one sell">Result</ng-container
                ><app-term-info term="realizedPnl" />
              </dt>
              <dd>
                <app-pnl
                  [value]="result()"
                  [currency]="data.currency"
                  [pct]="resultPct() ?? undefined"
                />
              </dd>
            </div>
          }
          <div>
            <dt class="app-label text-[11px]" i18n>Shares</dt>
            <dd class="tabular-nums">{{ t.quantity | qty }}</dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n="Price per share">Price</dt>
            <dd class="tabular-nums">{{ t.price | price: t.priceCurrency }}</dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n>Fees</dt>
            <dd class="tabular-nums">{{ t.fees + t.taxes | price: data.currency }}</dd>
          </div>
          <div>
            <dt class="app-label text-[11px]" i18n>Order type</dt>
            <dd>{{ t.orderType ? orderLabels[t.orderType] : '—' }}</dd>
          </div>
          @if (t.fxRate !== null && t.fxRate !== 1) {
            <div>
              <dt class="app-label text-[11px]" i18n>Exchange rate</dt>
              <dd class="tabular-nums">{{ t.fxRate | num: 4 }}</dd>
            </div>
          }
        </dl>
      </div>

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
