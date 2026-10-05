import { AccountCurrencyPipe } from '../../../shared/pipes/format.pipes';
import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { T212Instrument } from '../../../core/models/contract';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { StatList, StatRow } from '../../../shared/components/stat-list/stat-list';
import { PercentPipe, PricePipe } from '../../../shared/pipes/format.pipes';
import { accountCurrency, formatPrice, toneClass } from '../../../shared/utils/format';
import { Pnl } from '../../portfolio/pnl';
import { PositionHeader } from '../../portfolio/position-summary';

export interface UnrealizedSheetData {
  instrument: T212Instrument;
  accountCurrency: string | null;
}

/**
 * What the open shares of a stock are up or down right now, how it is calculated, the break-even price and how much a
 * 1% price move is worth. Opened as a dialog by the "Unrealized profit/loss" card.
 */
@Component({
  selector: 'app-unrealized-sheet',
  imports: [
    AccountCurrencyPipe,
    Dialog,
    PositionHeader,
    StatList,
    StatRow,
    Pnl,
    PercentPipe,
    PricePipe,
  ],
  template: `
    @let i = data.instrument;
    @let ccy = data.accountCurrency;
    <app-dialog>
      <app-position-header
        dialogHeader
        class="min-w-0 flex-1"
        [instrument]="i"
        linked
        (opened)="ref.close()"
      />
      <dl appStatList card>
        <div appStatRow label="Value now" i18n-label>{{ money(i.value) }}</div>
        <div appStatRow label="Purchase cost" i18n-label>− {{ money(i.costBasis) }}</div>
        <div appStatRow total label="Unrealized" i18n-label term="unrealizedPnl">
          <app-pnl [value]="i.unrealizedPnl" [currency]="ccy | acct" />
          @if (pct() !== null) {
            <span class="ml-1.5 text-sm font-semibold" [class]="tone()">({{ pct() | pct }})</span>
          }
        </div>
        @if (fxEffect() !== null) {
          <div appStatRow sub label="True gain" i18n-label term="trueGain">
            <app-pnl [value]="trueGain()" [currency]="ccy | acct" />
          </div>
          <div appStatRow sub label="FX impact" i18n-label>
            <app-pnl [value]="fxEffect()" [currency]="ccy | acct" />
          </div>
        }
      </dl>

      <dl appStatList class="mt-1.5">
        <div appStatRow label="Current price" i18n-label>
          {{ i.currentPrice | price: i.instrumentCurrency }}
        </div>
        <div appStatRow label="Break-even price" i18n-label term="breakEven">
          {{ i.averageCost | price: i.instrumentCurrency }}
        </div>
        <div appStatRow label="Price vs. break-even" i18n-label>{{ breakEvenMove() | pct }}</div>
        <div appStatRow label="A 1% price move is worth" i18n-label>
          ± {{ money(onePercent()) }}
        </div>
      </dl>
    </app-dialog>
  `,
})
export class UnrealizedSheet {
  protected readonly data = inject<UnrealizedSheetData>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef);

  protected readonly pct = computed(() => {
    const { unrealizedPnl, costBasis } = this.data.instrument;
    return unrealizedPnl !== null && costBasis ? (unrealizedPnl / costBasis) * 100 : null;
  });
  protected readonly tone = computed(() => toneClass(this.data.instrument.unrealizedPnl));
  /** How far the price is above (or below) the average cost, in percent, before currency effects; null when unknown. */
  protected readonly breakEvenMove = computed(() => {
    const { averageCost, currentPrice } = this.data.instrument;
    return averageCost && currentPrice !== null ? (currentPrice / averageCost - 1) * 100 : null;
  });
  /**
   * The part of the unrealized that comes from the exchange rate, not the price: the unrealized minus the price gain
   * converted at today's rate (value ÷ quantity × price). Null when the stock trades in the account currency.
   */
  protected readonly fxEffect = computed(() => {
    const { unrealizedPnl, value, quantity, currentPrice, averageCost, instrumentCurrency } =
      this.data.instrument;
    if (instrumentCurrency === this.data.accountCurrency) return null;
    if (
      unrealizedPnl === null ||
      value === null ||
      !quantity ||
      !currentPrice ||
      averageCost === null
    )
      return null;
    const rate = value / (quantity * currentPrice);
    return unrealizedPnl - (currentPrice - averageCost) * quantity * rate;
  });
  /** The unrealized without the exchange-rate part: what the price move alone earned, at today's rate. */
  protected readonly trueGain = computed(() => {
    const fx = this.fxEffect();
    const pnl = this.data.instrument.unrealizedPnl;
    return fx === null || pnl === null ? null : pnl - fx;
  });
  protected readonly onePercent = computed(() => {
    const value = this.data.instrument.value;
    return value === null ? null : value / 100;
  });

  protected money(value: number | null): string {
    return formatPrice(value, accountCurrency(this.data.accountCurrency));
  }
}
