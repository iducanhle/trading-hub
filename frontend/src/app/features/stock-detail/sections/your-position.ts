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
        class="mx-4 mb-3 flex items-center gap-4 rounded-3xl bg-surface-container-low p-4 hover:bg-surface-container"
        aria-labelledby="your-position-title"
      >
        <app-icon name="account_balance_wallet" class="shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <p id="your-position-title" class="text-sm font-semibold">
            <ng-container i18n>Your position</ng-container>
            @if (p.status === 'CLOSED') {
              · <ng-container i18n="Position status|Shares fully sold">Closed</ng-container>
            }
          </p>
          <p class="mt-1 text-sm text-on-surface-variant">
            @if (p.status === 'OPEN') {
              {{ p.quantity | qty }} <ng-container i18n>shares</ng-container> ·
              <ng-container i18n>avg.</ng-container>
              {{ p.averageCost | price: p.instrumentCurrency }}
            } @else {
              <ng-container i18n>Fully sold</ng-container>
            }
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-on-surface-variant" i18n>Total profit/loss</p>
          <app-pnl strong [value]="p.totalPnl" [currency]="currency()" [pct]="p.totalPnlPct" />
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
