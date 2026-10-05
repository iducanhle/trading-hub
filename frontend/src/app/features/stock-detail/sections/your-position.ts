import { AccountCurrencyPipe } from '../../../shared/pipes/format.pipes';
import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { T212Instrument } from '../../../core/models/contract';
import { ApiService } from '../../../core/api/api.service';
import { T212Service } from '../../../core/services/t212.service';
import { Icon } from '../../../shared/icon/icon';
import { Pnl } from '../../portfolio/pnl';
import { DEVICE_TZ, instrumentPnl, instrumentPnlPct } from '../../portfolio/portfolio-model';
import { PositionDialog, PositionDialogData } from '../../portfolio/position-dialog';
import { StockContext } from '../stock-context';
import { UnrealizedSheet, UnrealizedSheetData } from './unrealized-sheet';
import { DIALOG_CONFIG } from '../../../shared/components/dialog/dialog';
import { DisplayCurrencyService } from '../../../core/services/display-currency.service';

/**
 * The user's Trading 212 result for this stock: an "Unrealized profit" card while shares are held (tap: what it means
 * and the break-even price) and a "Realized profit" card: realized + dividends − fees, as on the Stocks tab (tap: the
 * position dialog, all time, realized only). Nothing at all when not connected, never traded, or Trading 212 is not
 * set up on the server.
 */
@Component({
  selector: 'app-your-position',
  imports: [AccountCurrencyPipe, Icon, Pnl],
  template: `
    @if (position(); as p) {
      @if (p.status === 'OPEN') {
        <button
          type="button"
          class="app-card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 px-4! py-3! text-left hover:bg-surface-container-high"
          aria-labelledby="unrealized-title"
          (click)="openUnrealized(p)"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary"
            aria-hidden="true"
            ><app-icon name="trending_up" [size]="20"
          /></span>
          <div class="min-w-0 flex-1">
            <p class="flex items-baseline justify-between gap-3">
              <span id="unrealized-title" class="text-sm leading-snug font-bold" i18n
                >Unrealized profit</span
              >
            </p>
            <p class="mt-0.5 flex text-sm">
              <app-pnl
                strong
                [value]="p.unrealizedPnl"
                [currency]="currency() | acct"
                [pct]="unrealizedPct(p)"
              />
            </p>
          </div>
          <app-icon name="chevron_right" class="shrink-0 text-on-surface-variant" />
        </button>
      }
      <button
        type="button"
        class="app-card mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 px-4! py-3! text-left hover:bg-surface-container-high"
        aria-labelledby="total-pnl-title"
        (click)="openRealized(p.t212Ticker)"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary"
          aria-hidden="true"
          ><app-icon name="account_balance_wallet" [size]="20"
        /></span>
        <div class="min-w-0 flex-1">
          <p id="total-pnl-title" class="text-sm leading-snug font-bold">
            <ng-container i18n="Card title|Realized profit/loss of this stock"
              >Realized profit</ng-container
            >
            @if (p.status === 'CLOSED') {
              · <ng-container i18n="Position status|Shares fully sold">Closed</ng-container>
            }
          </p>
          <p class="mt-0.5 flex text-sm">
            <app-pnl
              strong
              [value]="realized(p)"
              [currency]="currency() | acct"
              [pct]="realizedPct(p)"
            />
          </p>
        </div>
        <app-icon name="chevron_right" class="shrink-0 text-on-surface-variant" />
      </button>
    }
  `,
})
export class YourPosition {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  /** Applies the display currency picked on the Portfolio page to these amounts too. */
  private readonly displayCurrency = inject(DisplayCurrencyService);
  private readonly dialog = inject(MatDialog);

  private readonly instruments = rxResource({
    params: () => ({
      connected: this.t212.connected(),
      version: this.t212.dataVersion() + this.ctx.version(),
    }),
    stream: ({ params }) =>
      params.connected ? this.api.t212Instruments({ tz: DEVICE_TZ, status: 'ALL' }) : of(null),
  });

  protected readonly position = computed(() => {
    const list = this.instruments.hasValue() ? this.instruments.value() : null;
    const symbol = this.ctx.symbol();
    return list?.items.find((i) => i.symbol === symbol) ?? null;
  });
  protected readonly currency = computed(() =>
    this.instruments.hasValue() ? (this.instruments.value()?.accountCurrency ?? null) : null,
  );

  /** Without the unrealized, matching the Stocks tab the card links to. */
  protected realized(p: T212Instrument): number {
    return instrumentPnl(p, false);
  }

  protected realizedPct(p: T212Instrument): number | null {
    return instrumentPnlPct(p, false);
  }

  protected openRealized(t212Ticker: string): void {
    this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
      data: { t212Ticker, includeUnrealized: false },
      ...DIALOG_CONFIG,
    });
  }

  protected unrealizedPct(p: T212Instrument): number | null {
    return p.unrealizedPnl !== null && p.costBasis ? (p.unrealizedPnl / p.costBasis) * 100 : null;
  }

  protected openUnrealized(instrument: T212Instrument): void {
    const data: UnrealizedSheetData = { instrument, accountCurrency: this.currency() };
    this.dialog.open(UnrealizedSheet, { ...DIALOG_CONFIG, data });
  }

  constructor() {
    // Errors (e.g. T212_NOT_CONFIGURED) only mean there is no card.
    void this.t212.load();
  }
}
