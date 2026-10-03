import { Component, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { T212DetailTrade, T212Dividend, T212Side } from '../../core/models/contract';
import { Icon } from '../../shared/icon/icon';

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

/** Controls of the instrument page: all / buy / sell, and a sort dropdown (date by default) with its direction. */
@Component({
  selector: 'app-instrument-filters',
  imports: [
    MatButtonToggleGroup,
    MatButtonToggle,
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption,
    MatIconButton,
    Icon,
  ],
  template: `
    <div class="flex flex-wrap items-center gap-3">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        aria-label="Trade side"
        i18n-aria-label
        [value]="view().side ?? 'ALL'"
        (change)="update({ side: $event.value === 'ALL' ? null : $event.value })"
      >
        <mat-button-toggle value="ALL" i18n="All trades">All</mat-button-toggle>
        <mat-button-toggle value="BUY" i18n="Trade direction|Kind of trade">Buy</mat-button-toggle>
        <mat-button-toggle value="SELL" i18n="Trade direction|Kind of trade"
          >Sell</mat-button-toggle
        >
      </mat-button-toggle-group>
      <div class="ml-auto flex items-center gap-1">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="sort-field">
          <mat-label i18n>Sort</mat-label>
          <mat-select [value]="view().sort" (selectionChange)="update({ sort: $event.value })">
            @for (key of keys; track key) {
              <mat-option [value]="key">{{ labels[key] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button
          matIconButton
          type="button"
          [attr.aria-label]="view().descending ? descendingLabel : ascendingLabel"
          (click)="update({ descending: !view().descending })"
        >
          <app-icon name="swap_vert" [class.opacity-60]="view().descending" />
        </button>
      </div>
    </div>
  `,
  styles: `
    .sort-field {
      width: 10rem;
    }
  `,
})
export class InstrumentFilters {
  readonly view = input.required<TimelineView>();
  readonly viewChange = output<TimelineView>();

  protected readonly keys = SORT_KEYS;
  protected readonly labels = TIMELINE_SORT_LABELS;
  protected readonly descendingLabel = $localize`Descending, tap for ascending`;
  protected readonly ascendingLabel = $localize`Ascending, tap for descending`;

  protected update(patch: Partial<TimelineView>): void {
    this.viewChange.emit({ ...this.view(), ...patch });
  }
}
