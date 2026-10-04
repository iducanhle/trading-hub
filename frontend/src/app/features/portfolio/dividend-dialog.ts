import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { T212Dividend } from '../../core/models/contract';
import { Dialog } from '../../shared/components/dialog/dialog';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { AppDatePipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { dayIn, displayTicker } from './portfolio-model';

export interface DividendDialogData {
  dividend: T212Dividend;
  /** Account currency of the amount. */
  currency: string | null;
}

/** Opened from a row on the Dividends tab: that one payout only, not the whole position. */
@Component({
  selector: 'app-dividend-dialog',
  imports: [
    Dialog,
    StockLogo,
    HeroAmount,
    StatList,
    StatRow,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
  ],
  template: `
    @let x = data.dividend;
    <app-dialog [title]="x.name" [subtitle]="ticker() + ' · ' + (day() | appDate)">
      <app-stock-logo dialogLeading [symbol]="ticker()" [size]="44" />

      <p class="app-label" i18n>Dividend</p>
      <app-hero-amount class="mt-1" size="md" signed [value]="x.amount" [currency]="data.currency" />
      <dl appStatList card class="mt-3.5">
        <div appStatRow label="Shares" i18n-label>{{ x.quantity | qty }}</div>
        @if (x.grossPerShare !== null) {
          <div appStatRow label="Price per share" i18n-label>
            {{ x.grossPerShare | price: x.grossPerShareCurrency }}
          </div>
        }
      </dl>
    </app-dialog>
  `,
})
export class DividendDialog {
  protected readonly data = inject<DividendDialogData>(MAT_DIALOG_DATA);

  protected readonly ticker = computed(() => displayTicker(this.data.dividend));
  protected readonly day = computed(() => dayIn(this.data.dividend.paidAt));
}
