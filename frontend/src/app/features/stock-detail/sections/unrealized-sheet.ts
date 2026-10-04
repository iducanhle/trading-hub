import { Component, computed, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { T212Instrument } from '../../../core/models/contract';
import { Sheet } from '../../../shared/components/sheet/sheet';
import { HeroAmount } from '../../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../../shared/components/stat-list/stat-list';
import { TERMS } from '../../../shared/components/term-info/terms';
import { PercentPipe, PricePipe } from '../../../shared/pipes/format.pipes';
import { formatPrice, toneClass } from '../../../shared/utils/format';
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
  imports: [Sheet, HeroAmount, StatList, StatRow, Pnl, PercentPipe, PricePipe],
  template: `
    @let i = data.instrument;
    @let ccy = data.accountCurrency;
    <app-sheet [title]="title">
      <div class="flex flex-wrap items-baseline gap-x-2.5">
        <app-hero-amount size="md" signed [value]="i.unrealizedPnl" [currency]="ccy" />
        @if (pct() !== null) {
          <span class="text-base font-semibold" [class]="tone()">{{ pct() | pct }}</span>
        }
      </div>

      <dl appStatList card class="mt-3.5">
        <div appStatRow label="Value now" i18n-label>{{ money(i.value) }}</div>
        <div appStatRow label="What you paid" i18n-label>− {{ money(i.costBasis) }}</div>
        <div appStatRow total label="Unrealized" i18n-label term="unrealizedPnl">
          <app-pnl [value]="i.unrealizedPnl" [currency]="ccy" />
        </div>
        @if (fxEffect() !== null) {
          <div appStatRow sub label="Of which from the exchange rate" i18n-label>
            <app-pnl [value]="fxEffect()" [currency]="ccy" />
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
  protected readonly onePercent = computed(() => {
    const value = this.data.instrument.value;
    return value === null ? null : value / 100;
  });

  protected money(value: number | null): string {
    return formatPrice(value, this.data.accountCurrency);
  }
}
