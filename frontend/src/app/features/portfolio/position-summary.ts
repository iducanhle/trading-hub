import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { T212Instrument } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { displayTicker, instrumentPnl, instrumentPnlPct } from './portfolio-model';

/**
 * Logo, name, ticker and current price of one instrument. Shared by the position dialog and the instrument page;
 * a close button or other actions can be projected at the end.
 */
@Component({
  selector: 'app-position-header',
  imports: [StockLogo, PricePipe, RouterLink, Icon, NgTemplateOutlet],
  template: `
    <ng-template #body>
      <app-stock-logo [symbol]="ticker()" [logoUrl]="instrument().logoUrl" [size]="44" />
      <div class="min-w-0 flex-1">
        @if (named()) {
          <h2 class="flex min-w-0 items-center text-lg font-bold">
            <span class="truncate">{{ instrument().name }}</span>
            @if (linked()) {
              <app-icon name="chevron_right" class="shrink-0 text-on-surface-variant" />
            }
          </h2>
          <p class="text-sm text-on-surface-variant">
            {{ ticker() }} ·
            {{ instrument().currentPrice | price: instrument().instrumentCurrency }}
          </p>
        } @else {
          <p class="flex items-center text-lg font-bold">
            {{ ticker() }}
            @if (linked()) {
              <app-icon name="chevron_right" class="shrink-0 text-on-surface-variant" />
            }
          </p>
          <p class="text-sm text-on-surface-variant">
            {{ instrument().currentPrice | price: instrument().instrumentCurrency }}
          </p>
        }
      </div>
    </ng-template>
    @if (linked() && instrument().symbol; as symbol) {
      <a
        class="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 hover:bg-on-surface/5 focus-visible:outline-2 focus-visible:outline-primary"
        [routerLink]="['/stock', symbol]"
        aria-label="Open stock detail"
        i18n-aria-label
        (click)="opened.emit()"
      >
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <ng-container [ngTemplateOutlet]="body" />
    }
    <ng-content />
  `,
  host: { class: 'flex items-center gap-3' },
})
export class PositionHeader {
  readonly instrument = input.required<T212Instrument>();
  /** False where a page header already shows the name: the ticker leads instead. */
  readonly named = input(true, { transform: booleanAttribute });
  /** Logo, name, ticker and price link to the stock page (with a chevron) when the symbol is known. */
  readonly linked = input(false, { transform: booleanAttribute });
  /** The stock link was followed. */
  readonly opened = output();
  protected ticker(): string {
    return displayTicker(this.instrument());
  }
}

/**
 * The all-time profit/loss of one instrument and the position, as two cards: profit/loss with the shares held,
 * then value and prices. Extra cells for the second grid (a `<div>` with a `<dt>` and a `<dd>` each) can be
 * projected; they follow the standard ones.
 */
@Component({
  selector: 'app-position-summary',
  imports: [TermInfo, PricePipe, QuantityPipe, Pnl],
  template: `
    @let i = instrument();
    <div class="app-card">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="app-label flex items-center gap-1">
          <ng-container i18n>Total profit/loss</ng-container><app-term-info term="totalPnl" />
        </p>
        @if (includeUnrealized()) {
          <span
            class="app-pill bg-primary-container text-primary"
            i18n="Profit/loss basis badge|The total includes unrealized profit/loss"
            >Incl. unrealized</span
          >
        } @else {
          <span
            class="app-pill bg-secondary-container text-on-secondary-container"
            i18n="Profit/loss basis badge|The total leaves out unrealized profit/loss"
            >Realized only</span
          >
        }
      </div>
      <app-pnl
        strong
        class="mt-1 text-xl"
        [value]="total()"
        [currency]="currency()"
        [pct]="pct() ?? undefined"
      />
      <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] font-semibold">
        @if (includeUnrealized()) {
          <div>
            <dt class="app-label flex items-center gap-1 text-[11px]">
              <ng-container i18n>Unrealized</ng-container><app-term-info term="unrealizedPnl" />
            </dt>
            <dd><app-pnl [value]="i.unrealizedPnl" [currency]="currency()" /></dd>
          </div>
        }
        <div>
          <dt class="app-label flex items-center gap-1 text-[11px]">
            <ng-container i18n>Realized</ng-container><app-term-info term="realizedPnl" />
          </dt>
          <dd><app-pnl [value]="i.realizedPnl" [currency]="currency()" /></dd>
        </div>
        <!-- Not deducted in Realized; the total subtracts them. -->
        <div>
          <dt class="app-label text-[11px]" i18n>Fees</dt>
          <dd><app-pnl [value]="-i.fees" [currency]="currency()" /></dd>
        </div>
        <div>
          <dt class="app-label text-[11px]" i18n>Dividends</dt>
          <dd><app-pnl [value]="i.dividends" [currency]="currency()" /></dd>
        </div>
        <div>
          <dt class="app-label text-[11px]" i18n>Shares held</dt>
          <dd class="tabular-nums">{{ i.quantity | qty }}</dd>
        </div>
      </dl>
    </div>
    <dl class="app-card grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] font-semibold">
      <div>
        <dt class="app-label text-[11px]" i18n>Value · as of now</dt>
        <dd class="tabular-nums">{{ i.value | price: currency() }}</dd>
      </div>
      <div>
        <dt class="app-label flex items-center gap-1 text-[11px]">
          <ng-container i18n>Average cost</ng-container><app-term-info term="averageCost" />
        </dt>
        <dd class="tabular-nums">{{ i.averageCost | price: i.instrumentCurrency }}</dd>
      </div>
      <div>
        <dt class="app-label text-[11px]" i18n>Current price</dt>
        <dd class="tabular-nums">{{ i.currentPrice | price: i.instrumentCurrency }}</dd>
      </div>
      <ng-content />
    </dl>
  `,
  host: { class: 'flex flex-col gap-3' },
})
export class PositionSummary {
  readonly instrument = input.required<T212Instrument>();
  /** The account currency, in which the profit/loss and the value are. */
  readonly currency = input.required<string>();
  /** False: the total leaves out unrealized profit/loss and its cell is hidden, like the Stocks tab by default. */
  readonly includeUnrealized = input(true);

  protected readonly total = computed(() =>
    instrumentPnl(this.instrument(), this.includeUnrealized()),
  );
  /** All time only; hidden rather than shown as a dash in a shorter period. */
  protected readonly pct = computed(() =>
    instrumentPnlPct(this.instrument(), this.includeUnrealized()),
  );
}
