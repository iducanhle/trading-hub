import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { T212Instrument } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { PercentPipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { toneClass } from '../../shared/utils/format';
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
 * The profit/loss of one instrument and the position (docs/REDESIGN-SPEC.md): the basis pill (pills projected with
 * `summaryPill` come first), the total as a hero figure, then the figures it adds up from as rows ending in the total,
 * and the position facts as plain rows. Extra rows (`<div appStatRow>`) can be projected after the standard ones.
 */
@Component({
  selector: 'app-position-summary',
  imports: [TermInfo, PricePipe, QuantityPipe, PercentPipe, Pnl, HeroAmount, StatList, StatRow],
  template: `
    @let i = instrument();
    <div class="flex flex-wrap items-center gap-2">
      <ng-content select="[summaryPill]" />
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
    <p class="mt-4 app-label flex items-center gap-1">
      <ng-container i18n>Total profit/loss</ng-container><app-term-info term="totalPnl" />
    </p>
    <div class="mt-1 flex flex-wrap items-baseline gap-x-2.5">
      <app-hero-amount size="md" signed [value]="total()" [currency]="currency()" />
      @if (pct() !== null) {
        <span class="text-base font-semibold" [class]="tone()">{{ pct() | pct }}</span>
      }
    </div>
    <dl appStatList card class="mt-3.5">
      @if (includeUnrealized()) {
        <div appStatRow label="Unrealized" i18n-label term="unrealizedPnl">
          <app-pnl [value]="i.unrealizedPnl" [currency]="currency()" />
        </div>
      }
      <div appStatRow label="Realized" i18n-label term="realizedPnl">
        <app-pnl [value]="i.realizedPnl" [currency]="currency()" />
      </div>
      <div appStatRow label="Dividends" i18n-label>
        <app-pnl [value]="i.dividends" [currency]="currency()" />
      </div>
      <!-- Not deducted in Realized; the total subtracts them. -->
      <div appStatRow label="Fees" i18n-label>
        <app-pnl [value]="-i.fees" [currency]="currency()" />
      </div>
      <div appStatRow total label="Total" i18n-label="Sum of the rows above">
        <app-pnl [value]="total()" [currency]="currency()" />
      </div>
    </dl>
    <dl appStatList class="mt-1.5">
      <div appStatRow label="Shares held" i18n-label>{{ i.quantity | qty }}</div>
      <div appStatRow label="Value now" i18n-label="Current value of the position">
        {{ i.value | price: currency() }}
      </div>
      <div appStatRow label="Average cost" i18n-label term="averageCost">
        {{ i.averageCost | price: i.instrumentCurrency }}
      </div>
      <div appStatRow label="Current price" i18n-label>
        {{ i.currentPrice | price: i.instrumentCurrency }}
      </div>
      <ng-content />
    </dl>
  `,
  host: { class: 'block' },
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
  protected readonly tone = computed(() => toneClass(this.total()));
}
