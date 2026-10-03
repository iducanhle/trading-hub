import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';
import { T212Service } from '../../../core/services/t212.service';
import { Icon } from '../../../shared/icon/icon';
import { PricePipe, QuantityPipe } from '../../../shared/pipes/format.pipes';
import { Pnl } from '../../portfolio/pnl';
import { DEVICE_TZ } from '../../portfolio/portfolio-model';
import { StockContext } from '../stock-context';

/**
 * "Your position": shares, average cost and total profit/loss when the user's Trading 212 account holds or held
 * this stock. Nothing at all otherwise (not connected, never traded, or Trading 212 not set up on the server).
 */
@Component({
  selector: 'app-your-position',
  imports: [RouterLink, Icon, PricePipe, QuantityPipe, Pnl],
  template: `
    @if (position(); as p) {
      <a
        [routerLink]="['/portfolio', p.t212Ticker]"
        class="app-card mx-4 mt-3.5 flex items-center gap-3.5 hover:bg-surface-container-high"
        aria-labelledby="your-position-title"
      >
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary"
          aria-hidden="true"
          ><app-icon name="account_balance_wallet" [size]="20"
        /></span>
        <div class="min-w-0 flex-1">
          <p class="flex items-baseline justify-between gap-3">
            <span id="your-position-title" class="text-[15px] font-bold">
              <ng-container i18n>Your position</ng-container>
              @if (p.status === 'CLOSED') {
                · <ng-container i18n="Position status|Shares fully sold">Closed</ng-container>
              }
            </span>
            <span class="app-label text-[11px]" i18n>Total profit/loss</span>
          </p>
          <p class="mt-0.5 flex items-baseline justify-between gap-3">
            <span class="min-w-0 truncate text-[12.5px] font-semibold text-on-surface-variant">
              @if (p.status === 'OPEN') {
                {{ p.quantity | qty }} <ng-container i18n>shares</ng-container> ·
                <ng-container i18n>avg.</ng-container>
                {{ p.averageCost | price: p.instrumentCurrency }}
              } @else {
                <ng-container i18n>Fully sold</ng-container>
              }
            </span>
            <app-pnl
              strong
              class="shrink-0"
              [value]="p.totalPnl"
              [currency]="currency()"
              [pct]="p.totalPnlPct"
            />
          </p>
        </div>
        <app-icon name="chevron_right" class="shrink-0 text-on-surface-variant" />
      </a>
    }
  `,
})
export class YourPosition {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

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

  constructor() {
    // Errors (e.g. T212_NOT_CONFIGURED) only mean there is no card.
    void this.t212.load();
  }
}
