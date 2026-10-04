import { Component, computed, input, output } from '@angular/core';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { T212DetailTrade, T212Dividend, T212Side } from '../../core/models/contract';
import { Icon } from '../../shared/icon/icon';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

export type TimelineItem =
  | { kind: 'trade'; at: string; trade: T212DetailTrade }
  | { kind: 'dividend'; at: string; dividend: T212Dividend };

export type TimelineSortKey = 'date' | 'amount' | 'profit';

export interface TimelineView {
  /** Buy or sell only; dividends and other events are hidden while set. */
  side: T212Side | null;
  sort: TimelineSortKey;
  /** Descending: newest, largest or most profitable first. */
  descending: boolean;
}

export const DEFAULT_VIEW: TimelineView = { side: null, sort: 'date', descending: true };

export const SORT_KEYS: readonly TimelineSortKey[] = ['date', 'amount', 'profit'];

export const TIMELINE_SORT_LABELS: Record<TimelineSortKey, string> = {
  date: $localize`:Sort by:Date`,
  amount: $localize`:Sort by:Amount`,
  profit: $localize`:Sort by:Profit size`,
};

/** Size of an item: the trade value or the dividend amount. */
function amountOf(item: TimelineItem): number {
  return Math.abs(item.kind === 'trade' ? item.trade.value : item.dividend.amount);
}

/** Profit or loss of an item: a sell's realized result or a dividend; null for buys and other events. */
function profitOf(item: TimelineItem): number | null {
  return item.kind === 'trade' ? item.trade.realizedPnl : item.dividend.amount;
}

/** The items that pass the side filter, in the chosen order. Items without a profit come last when sorting by it. */
export function applyView(items: readonly TimelineItem[], view: TimelineView): TimelineItem[] {
  const sign = view.descending ? -1 : 1;
  return items
    .filter((item) =>
      view.side
        ? item.kind === 'trade' && item.trade.kind === 'TRADE' && item.trade.side === view.side
        : true,
    )
    .sort((a, b) => {
      if (view.sort === 'amount') return sign * (amountOf(a) - amountOf(b));
      if (view.sort === 'profit') {
        const pa = profitOf(a);
        const pb = profitOf(b);
        if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1;
        return sign * (pa - pb);
      }
      return sign * a.at.localeCompare(b.at);
    });
}

/**
 * Controls of the instrument page: the projected heading with a sort menu (date by default) and its direction beside
 * it, then all / buy / sell across the full width.
 */
@Component({
  selector: 'app-instrument-filters',
  imports: [Segmented, Segment, MatMenu, MatMenuItem, MatMenuTrigger, Icon],
  template: `
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1"><ng-content /></div>
      <button
        type="button"
        class="inline-flex h-9 min-w-0 items-center gap-1 rounded-full bg-surface-container pr-2.5 pl-4 text-[13px] font-bold hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-primary"
        [matMenuTriggerFor]="sortMenu"
        [attr.aria-label]="sortLabel()"
      >
        <span class="truncate">{{ labels[view().sort] }}</span>
        <app-icon name="keyboard_arrow_down" [size]="18" class="shrink-0 text-on-surface-variant" />
      </button>
      <button
        type="button"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-primary"
        [attr.aria-label]="view().descending ? descendingLabel : ascendingLabel"
        (click)="update({ descending: !view().descending })"
      >
        <app-icon [name]="view().descending ? 'arrow_down' : 'arrow_up'" [size]="18" />
      </button>
    </div>
    <app-segmented
      class="mt-3"
      stretch
      aria-label="Trade side"
      i18n-aria-label
      [value]="side()"
      (valueChange)="update({ side: $event === 'ALL' ? null : $event })"
    >
      <app-segment value="ALL" i18n="All trades">All</app-segment>
      <app-segment value="BUY" i18n="Trade direction|Kind of trade">Buy</app-segment>
      <app-segment value="SELL" i18n="Trade direction|Kind of trade">Sell</app-segment>
    </app-segmented>
    <mat-menu #sortMenu="matMenu" xPosition="before">
      @for (key of keys; track key) {
        <button mat-menu-item type="button" (click)="update({ sort: key })">
          <span class="flex items-center justify-between gap-6">
            {{ labels[key] }}
            @if (key === view().sort) {
              <app-icon name="check" [size]="18" class="text-primary" />
            }
          </span>
        </button>
      }
    </mat-menu>
  `,
})
export class InstrumentFilters {
  readonly view = input.required<TimelineView>();
  readonly viewChange = output<TimelineView>();

  protected readonly side = computed<T212Side | 'ALL'>(() => this.view().side ?? 'ALL');

  protected readonly keys = SORT_KEYS;
  protected readonly labels = TIMELINE_SORT_LABELS;
  protected readonly sortLabel = computed(
    () => $localize`Sort by ${TIMELINE_SORT_LABELS[this.view().sort]}:sort:`,
  );
  protected readonly descendingLabel = $localize`Descending, tap for ascending`;
  protected readonly ascendingLabel = $localize`Ascending, tap for descending`;

  protected update(patch: Partial<TimelineView>): void {
    this.viewChange.emit({ ...this.view(), ...patch });
  }
}

/** Trades and dividends together, newest first. */
export function buildTimeline(
  trades: readonly T212DetailTrade[],
  dividends: readonly T212Dividend[],
): TimelineItem[] {
  return [
    ...trades.map((trade): TimelineItem => ({ kind: 'trade', at: trade.executedAt, trade })),
    ...dividends.map((dividend): TimelineItem => ({
      kind: 'dividend',
      at: dividend.paidAt,
      dividend,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
