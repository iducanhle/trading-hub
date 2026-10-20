import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { T212GroupHolding, T212GroupTrade } from '../../core/models/contract';
import { DIALOG_CONFIG, Dialog } from '../../shared/components/dialog/dialog';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import {
  AccountCurrencyPipe,
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { GroupTradesDialog, GroupTradesDialogData } from './group-trades-dialog';
import { Pnl } from './pnl';
import { SIDE_LABELS } from './portfolio-labels';
import { displayTicker } from './portfolio-model';
import { TradeTile } from './trade-tile';

export interface GroupHoldingDialogData {
  holding: T212GroupHolding;
  /** The group's trades of this stock only, newest first. */
  trades: T212GroupTrade[];
  groupId: string;
  groupName: string;
  /** Account currency of the values, fees and profit/loss. */
  currency: string | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Opened from a holding on a group's page: that stock inside the group only, at the group's own average price. The
 * fees, bought, sold and trades are the group's trades of the stock, not the whole position in the account.
 */
@Component({
  selector: 'app-group-holding-dialog',
  imports: [
    AccountCurrencyPipe,
    MatButton,
    Dialog,
    HeroAmount,
    StatList,
    StatRow,
    StockLogo,
    TradeTile,
    Icon,
    Pnl,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
  ],
  template: `
    @let h = data.holding;
    @let currency = data.currency | acct;
    <app-dialog [title]="h.name" [subtitle]="ticker() + ' · ' + data.groupName">
      <app-stock-logo dialogLeading [symbol]="ticker()" [logoUrl]="h.logoUrl" [size]="44" />

      <p class="app-label" i18n="Current value of a group's shares in one stock">Value</p>
      <app-hero-amount class="mt-1" size="md" [value]="h.value" [currency]="currency" />
      <p class="mt-1.5 text-[15px] font-semibold">
        <app-pnl [value]="figures().total" [currency]="currency" [pct]="figures().totalPct" />
      </p>

      <dl appStatList card class="mt-3.5">
        <div
          appStatRow
          label="Unrealized"
          i18n-label="Unrealized profit or loss of open positions"
          term="unrealizedPnl"
        >
          <app-pnl [value]="h.unrealizedPnl" [currency]="currency" [pct]="h.unrealizedPnlPct" />
        </div>
        <div
          appStatRow
          label="Realized"
          i18n-label="Realized profit/loss of the groups' sells"
          term="groupPnl"
        >
          <app-pnl [value]="figures().realized" [currency]="currency" />
        </div>
        <div appStatRow label="Fees" i18n-label="Trading fees and taxes">
          <app-pnl [value]="-figures().fees" [currency]="currency" />
        </div>
        <div
          appStatRow
          total
          divider
          label="Total"
          i18n-label="Total profit/loss of a group"
          term="totalPnl"
        >
          <app-pnl
            [value]="figures().total"
            [currency]="currency"
            [pct]="figures().totalPct"
            strong
          />
        </div>
      </dl>

      <p class="mt-5 mb-2 app-label" i18n="Heading of the current position facts">
        Currently holding
      </p>
      <dl appStatList card>
        <div appStatRow label="Shares held" i18n-label>{{ h.quantity | qty }}</div>
        <div appStatRow label="Invested" i18n-label="Cost of the shares a group holds now">
          {{ h.invested | price: currency }}
        </div>
        <div
          appStatRow
          label="Average cost"
          i18n-label="Average cost per share at the group's own average price"
        >
          {{ figures().averageCost | price: currency }}
        </div>
        <div appStatRow label="FX fees" i18n-label term="fxFees">
          <app-pnl [value]="-figures().fxFees" [currency]="currency" />
        </div>
        <div appStatRow label="Bought" i18n-label>{{ figures().bought | price: currency }}</div>
        <div appStatRow label="Sold" i18n-label>{{ figures().sold | price: currency }}</div>
      </dl>

      <div class="mt-5 mb-2 flex items-center gap-3 px-1">
        <h3 class="min-w-0 flex-1 truncate app-title-card">
          <ng-container i18n="Heading: a group's trades of one stock"
            >Trades in this group</ng-container
          >
          · {{ data.trades.length }}
        </h3>
        <button matButton="tonal" type="button" (click)="editTrades()">
          <app-icon matButtonIcon name="edit" [size]="18" />
          <ng-container i18n="Button that adds or removes a stock's trades in a group"
            >Edit</ng-container
          >
        </button>
      </div>
      <ul class="app-card py-1">
        @for (t of data.trades; track t.id) {
          <li class="flex items-center gap-3.5 py-2.5">
            <app-trade-tile [kind]="t.side === 'BUY' ? 'buy' : 'sell'" />
            <span class="min-w-0 flex-1">
              <span class="block truncate app-row-title">{{ sideLabels[t.side] }}</span>
              <span class="flex items-center gap-1 app-row-meta">
                @if (t.oversold) {
                  <app-icon name="warning" [size]="14" class="shrink-0 text-error" />
                  <span class="sr-only" i18n>Sells more shares than the group held</span>
                }
                <span class="min-w-0 truncate">
                  {{ t.executedAt | appDate }} · {{ t.quantity | qty }}
                  @if (t.price !== null) {
                    × {{ t.price | price: t.priceCurrency }}
                  }
                </span>
              </span>
            </span>
            <span class="flex shrink-0 flex-col items-end text-right">
              <span class="text-[15px] font-semibold">{{ t.value | price: currency }}</span>
              @if (t.groupRealizedPnl !== null) {
                <span class="mt-0.5 text-[13px] font-medium" [class]="tone(t.groupRealizedPnl)">{{
                  t.groupRealizedPnl | money: currency
                }}</span>
              }
            </span>
          </li>
        }
      </ul>
    </app-dialog>
  `,
})
export class GroupHoldingDialog {
  protected readonly data = inject<GroupHoldingDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<GroupHoldingDialog, boolean>);
  private readonly dialog = inject(MatDialog);

  protected readonly sideLabels = SIDE_LABELS;
  protected readonly ticker = computed(() => displayTicker(this.data.holding));

  /** Built from the group's trades of this stock, as the backend builds the group's own figures. */
  protected readonly figures = computed(() => {
    const { holding: h, trades } = this.data;
    let realized = 0;
    let fees = 0;
    let fxFees = 0;
    let bought = 0;
    let sold = 0;
    for (const t of trades) {
      realized += t.groupRealizedPnl ?? 0;
      fees += t.fees + t.taxes;
      // Trading 212 charges no commission, so trade fees are the currency conversion fee (DATA-SOURCES.md).
      fxFees += t.fees;
      if (t.side === 'BUY') bought += t.value;
      else sold += t.value;
    }
    // Without a live value the unrealized part is unknown, so is the total.
    const total = h.unrealizedPnl === null ? null : round(realized - fees + h.unrealizedPnl);
    return {
      realized: round(realized),
      fees: round(fees),
      fxFees: round(fxFees),
      bought: round(bought),
      sold: round(sold),
      total,
      totalPct: total !== null && bought > 0 ? round((total / bought) * 100) : null,
      averageCost: h.quantity > 0 ? h.invested / h.quantity : null,
    };
  });

  /** Ticks and unticks this stock's trades; after a save this closes with true, so the group page reloads. */
  protected async editTrades(): Promise<void> {
    const { groupId, groupName, currency, holding } = this.data;
    const ref = this.dialog.open<GroupTradesDialog, GroupTradesDialogData, boolean>(
      GroupTradesDialog,
      { ...DIALOG_CONFIG, data: { groupId, groupName, currency, stock: holding } },
    );
    if (await firstValueFrom(ref.afterClosed())) this.ref.close(true);
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }
}
