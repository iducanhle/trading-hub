import { AccountCurrencyPipe } from '../../shared/pipes/format.pipes';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ApiService } from '../../core/api/api.service';
import { T212Trade } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { Icon } from '../../shared/icon/icon';
import { pickTradeGroup } from './group-dialogs';
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
  /** Called after the trade moved to another group (or out of one). */
  groupChanged?: (groupId: string | null) => void;
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
    AccountCurrencyPipe,
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
    Icon,
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
            : 'bg-on-surface/10 text-on-surface'
        "
        >{{ label() }}</span
      >

      <p class="app-label" i18n="Total value of a trade">Value</p>
      <app-hero-amount
        class="mt-1"
        size="md"
        [value]="valueBeforeFees()"
        [currency]="data.currency | acct"
      />
      @if (t.original; as o) {
        <p class="mt-1.5">
          <span
            class="app-pill bg-primary-container text-primary"
            i18n="
              Pill on a trade that settled in another currency than the account's; CURRENCY is a
              code like USD
            "
            >Traded in {{ o.currency }}</span
          >
        </p>
      }
      <dl appStatList card class="mt-3.5">
        <div appStatRow label="Shares" i18n-label>{{ t.quantity | qty }}</div>
        <div appStatRow label="Price per share" i18n-label>
          {{ t.price | price: t.priceCurrency }}
        </div>
        @if (t.original; as o) {
          <div appStatRow [label]="originalValueLabel()">{{ o.value | price: o.currency }}</div>
          <div appStatRow label="Exchange rate" i18n-label term="tradeDayRate">
            @if (o.rate !== null) {
              1 {{ o.currency }} = {{ o.rate | price: data.currency }}
            } @else {
              —
            }
          </div>
        } @else if (t.fxRate !== null && t.fxRate !== 1) {
          <div appStatRow label="Exchange rate" i18n-label>{{ t.fxRate | num: 4 }}</div>
        }
        <div appStatRow label="Fees" i18n-label="Trading fees and taxes">
          <app-pnl [value]="-(t.fees + t.taxes)" [currency]="data.currency | acct" />
        </div>
        <div appStatRow label="Including fees" i18n-label term="includingFees">
          {{ t.value | price: (data.currency | acct) }}
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
              [currency]="data.currency | acct"
              [pct]="resultPct() ?? undefined"
            />
          </div>
          @if (t.original; as o) {
            @if (o.realizedPnl !== null) {
              <div appStatRow sub [label]="originalResultLabel()">
                <app-pnl [value]="o.realizedPnl" [currency]="o.currency" />
              </div>
            }
          }
        }
      </dl>
      <dl appStatList class="mt-1.5">
        <div appStatRow label="Order type" i18n-label>
          {{ t.orderType ? orderLabels[t.orderType] : '—' }}
        </div>
        @if (t.kind === 'TRADE') {
          <div appStatRow label="Group" i18n-label="The group of trades this trade is in">
            <button
              type="button"
              class="-my-1 inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-primary hover:bg-surface-container-high disabled:opacity-60"
              [disabled]="saving()"
              (click)="pickGroup()"
            >
              <span class="truncate">{{ groupName() }}</span>
              <app-icon name="edit" [size]="15" class="shrink-0" />
            </button>
          </div>
        }
      </dl>
    </app-dialog>
  `,
})
export class TradeDialog {
  protected readonly data = inject<TradeDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<TradeDialog>);
  private readonly notifier = inject(NotifierService);

  /** The trade's group. Moving it to another group closes the dialog. */
  protected readonly groupId = signal(this.data.trade.groupId ?? null);
  protected readonly saving = signal(false);
  private readonly groups = rxResource({
    params: () => (this.groupId() ? { id: this.groupId() } : undefined),
    stream: () => this.api.t212Groups(),
  });
  protected readonly groupName = computed(() => {
    const id = this.groupId();
    if (!id) return $localize`:The trade is in no group:None`;
    const group = this.groups.hasValue()
      ? this.groups.value().items.find((g) => g.id === id)
      : null;
    return group?.name ?? '…';
  });

  protected async pickGroup(): Promise<void> {
    this.saving.set(true);
    try {
      const picked = await pickTradeGroup(
        this.dialog,
        this.api,
        this.notifier,
        this.data.trade.id,
        this.groupId(),
      );
      if (picked === undefined) return;
      this.data.groupChanged?.(picked);
      this.dialogRef.close();
    } finally {
      this.saving.set(false);
    }
  }

  protected readonly orderLabels = ORDER_LABELS;
  protected readonly ticker = computed(() => displayTicker(this.data.trade));
  /** "In USD": the trade value as it settled, for a trade outside the account currency. */
  protected readonly originalValueLabel = computed(
    () =>
      $localize`:Trade value in the currency it settled in; CURRENCY is a code like USD:In ${this.data.trade.original?.currency ?? ''}:CURRENCY:`,
  );
  protected readonly originalResultLabel = computed(
    () =>
      $localize`:Profit/loss of a sell in the currency it settled in; CURRENCY is a code like USD:Result in ${this.data.trade.original?.currency ?? ''}:CURRENCY:`,
  );
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
