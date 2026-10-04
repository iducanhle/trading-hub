import { Component, input } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';
import {
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { TimelineItem } from './instrument-filters';
import { KIND_LABELS, SIDE_LABELS } from './portfolio-labels';
import { dayIn } from './portfolio-model';

/** Trades and dividends of one instrument as a card list, with the shares held after each trade. */
@Component({
  selector: 'app-timeline-list',
  imports: [Icon, AppDatePipe, PricePipe, QuantityPipe, SignedMoneyPipe],
  template: `
    <ol class="app-card py-2">
      @for (
        item of items();
        track item.kind + (item.kind === 'trade' ? item.trade.id : item.dividend.id)
      ) {
        <li class="flex items-center gap-3.5 py-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl"
            [class]="tileClass(item)"
            aria-hidden="true"
          >
            <app-icon [name]="tileIcon(item)" [size]="20" [strokeWidth]="2" />
          </span>
          @if (item.kind === 'trade') {
            @let t = item.trade;
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-medium">
                {{ t.kind === 'TRADE' ? sideLabels[t.side] : kindLabels[t.kind] }}
                {{ t.quantity | qty }}
                @if (t.price !== null) {
                  × {{ t.price | price: t.priceCurrency }}
                }
              </span>
              <span class="mt-0.5 block text-[12.5px] font-semibold text-on-surface-variant">
                {{ day(t.executedAt) | appDate }} ·
                <ng-container i18n>held after: {{ t.positionAfter | qty }}</ng-container>
              </span>
            </span>
            <span class="flex shrink-0 flex-col items-end text-right">
              @if (t.value > 0) {
                <span class="text-[15px] font-semibold">{{ t.value | price: currency() }}</span>
              }
              @if (t.realizedPnl !== null) {
                <span class="mt-0.5 text-[12.5px] font-medium" [class]="tone(t.realizedPnl)">{{
                  t.realizedPnl | money: currency()
                }}</span>
              }
            </span>
          } @else {
            @let v = item.dividend;
            <span class="min-w-0 flex-1">
              <span class="block text-[15px] font-medium" i18n>Dividend</span>
              <span class="mt-0.5 block text-[12.5px] font-semibold text-on-surface-variant">
                {{ day(v.paidAt) | appDate }} · {{ v.quantity | qty }}
                <ng-container i18n>shares</ng-container>
              </span>
            </span>
            <span class="shrink-0 text-[15px] font-semibold" [class]="tone(v.amount)">{{
              v.amount | money: currency()
            }}</span>
          }
        </li>
      }
    </ol>
  `,
})
export class TimelineList {
  readonly items = input.required<readonly TimelineItem[]>();
  /** The account currency of the values and dividends. */
  readonly currency = input.required<string>();

  protected readonly sideLabels = SIDE_LABELS;
  protected readonly kindLabels = KIND_LABELS;

  protected day(iso: string | null): string | null {
    return iso ? dayIn(iso) : null;
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** Buys on the accent tint with a down arrow, sells on card2 with an up arrow, dividends in the gain colour. */
  protected tileClass(item: TimelineItem): string {
    if (item.kind === 'dividend') return 'bg-surface-container-high text-gain';
    if (item.trade.kind === 'TRADE' && item.trade.side === 'BUY')
      return 'bg-primary-container text-primary';
    return 'bg-surface-container-high text-on-surface';
  }

  protected tileIcon(item: TimelineItem): IconName {
    if (item.kind === 'dividend') return 'savings';
    if (item.trade.kind !== 'TRADE') return 'swap_vert';
    return item.trade.side === 'BUY' ? 'arrow_down' : 'arrow_up';
  }
}
