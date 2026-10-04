import { Component, computed, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { T212Instrument } from '../../../core/models/contract';
import { Sheet } from '../../../shared/components/sheet/sheet';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { TERMS } from '../../../shared/components/term-info/terms';
import { PercentPipe, PricePipe } from '../../../shared/pipes/format.pipes';
import { formatPrice } from '../../../shared/utils/format';
import { Pnl } from '../../portfolio/pnl';

export interface UnrealizedSheetData {
  instrument: T212Instrument;
  accountCurrency: string | null;
}

/**
 * What the open shares of a stock are up or down right now, how it is calculated, the break-even price and how much a
 * 1% price move is worth. Opened by the "Unrealized profit/loss" card: a bottom sheet on phones, a dialog on desktop.
 */
@Component({
  selector: 'app-unrealized-sheet',
  imports: [Sheet, TermInfo, Pnl, PercentPipe, PricePipe],
  template: `
    @let i = data.instrument;
    @let ccy = data.accountCurrency;
    <app-sheet [title]="title">
      <p class="text-[28px] leading-tight">
        <app-pnl strong [value]="i.unrealizedPnl" [currency]="ccy" [pct]="pct()" />
      </p>

      <dl class="app-card mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-[14px]">
        <dt class="text-on-surface-variant" i18n>Value now</dt>
        <dd class="text-right font-semibold">{{ money(i.value) }}</dd>
        <dt class="text-on-surface-variant" i18n>What you paid</dt>
        <dd class="text-right font-semibold">− {{ money(i.costBasis) }}</dd>
        <dt class="flex items-center gap-1 border-t border-outline-variant pt-2.5 font-semibold">
          <ng-container i18n>Unrealized</ng-container><app-term-info term="unrealizedPnl" />
        </dt>
        <dd class="border-t border-outline-variant pt-2.5 text-right">
          <app-pnl strong [value]="i.unrealizedPnl" [currency]="ccy" />
        </dd>
        @if (fxEffect() !== null) {
          <dt class="text-[13px] text-on-surface-variant" i18n>Of which from the exchange rate</dt>
          <dd class="text-right text-[13px]"><app-pnl [value]="fxEffect()" [currency]="ccy" /></dd>
        }
      </dl>

      <dl class="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-[14px]">
        <dt class="text-on-surface-variant" i18n>Current price</dt>
        <dd class="text-right font-semibold">{{ i.currentPrice | price: i.instrumentCurrency }}</dd>
        <dt class="flex items-center gap-1 text-on-surface-variant">
          <ng-container i18n>Break-even price</ng-container><app-term-info term="breakEven" />
        </dt>
        <dd class="text-right font-semibold">{{ i.averageCost | price: i.instrumentCurrency }}</dd>
        <dt class="text-on-surface-variant" i18n>Price vs. break-even</dt>
        <dd class="text-right font-semibold">{{ breakEvenMove() | pct }}</dd>
        <dt class="text-on-surface-variant" i18n>A 1% price move is worth</dt>
        <dd class="text-right font-semibold">± {{ money(onePercent()) }}</dd>
      </dl>
    </app-sheet>
  `,
})
export class UnrealizedSheet {
  protected readonly data: UnrealizedSheetData =
    inject<UnrealizedSheetData>(MAT_BOTTOM_SHEET_DATA, { optional: true }) ??
    inject<UnrealizedSheetData>(MAT_DIALOG_DATA);

  protected readonly title = TERMS.unrealizedPnl.title;

  protected readonly pct = computed(() => {
    const { unrealizedPnl, costBasis } = this.data.instrument;
    return unrealizedPnl !== null && costBasis ? (unrealizedPnl / costBasis) * 100 : null;
  });
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
  protected readonly onePercent = computed(() => {
    const value = this.data.instrument.value;
    return value === null ? null : value / 100;
  });

  protected money(value: number | null): string {
    return formatPrice(value, this.data.accountCurrency);
  }
}
