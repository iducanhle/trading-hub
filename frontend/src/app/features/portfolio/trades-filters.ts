import { Component, Signal, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatSelect, MatSelectTrigger } from '@angular/material/select';
import { T212Side } from '../../core/models/contract';
import { Sheet } from '../../shared/components/sheet/sheet';
import { displayTicker } from './portfolio-model';

export interface TradeFilters {
  side: T212Side | null;
  /** t212Tickers; empty = all stocks. */
  tickers: string[];
}

/** Order of the Trades list; anything but newest first loads every trade of the period to sort them. */
export type TradeSort = 'newest' | 'oldest' | 'value' | 'result';

export const DEFAULT_TRADE_SORT: TradeSort = 'newest';

export const TRADE_SORTS: readonly TradeSort[] = ['newest', 'oldest', 'value', 'result'];

export const TRADE_SORT_LABELS: Record<TradeSort, string> = {
  newest: $localize`:Sort by:Newest`,
  oldest: $localize`:Sort by:Oldest`,
  value: $localize`:Sort by:Value`,
  result: $localize`:Sort by:Result`,
};

export const NO_TRADE_FILTERS: TradeFilters = { side: null, tickers: [] };

export interface InstrumentOption {
  t212Ticker: string;
  symbol: string | null;
  name: string;
}

/** What the sheet edits: the stocks and the sort (the side stays on the page). */
export interface TradesView {
  tickers: string[];
  sort: TradeSort;
}

export interface TradesFilterContext {
  view: TradesView;
  instruments: Signal<InstrumentOption[]>;
  change: (view: TradesView) => void;
}

/** Stocks (multi-select) and sort of the Trades tab in a bottom sheet, as on the Stocks tab; a draft until Done. */
@Component({
  selector: 'app-trades-filter-sheet',
  imports: [Sheet, MatButton, MatFormField, MatLabel, MatSelect, MatSelectTrigger, MatOption],
  template: `
    <app-sheet title="Filters" i18n-title>
      <div class="flex flex-col gap-3">
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n>Stocks</mat-label>
          <mat-select
            multiple
            [value]="draft().tickers"
            (selectionChange)="patch({ tickers: $event.value })"
          >
            <mat-select-trigger>{{ summary() }}</mat-select-trigger>
            @for (option of options(); track option.t212Ticker) {
              <mat-option [value]="option.t212Ticker">
                <span class="font-medium">{{ ticker(option) }}</span>
                <span class="ml-2 text-on-surface-variant">{{ option.name }}</span>
              </mat-option>
            } @empty {
              <mat-option disabled i18n>No trades in this period</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n>Sort</mat-label>
          <mat-select [value]="draft().sort" (selectionChange)="patch({ sort: $event.value })">
            @for (option of sorts; track option) {
              <mat-option [value]="option">{{ sortLabels[option] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <button sheetActions matButton="tonal" type="button" (click)="draft.set(defaults)">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button sheetActions matButton="filled" type="button" (click)="done()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-sheet>
  `,
})
export class TradesFilterSheet {
  private readonly context = inject<TradesFilterContext>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<TradesFilterSheet>);

  protected readonly sorts = TRADE_SORTS;
  protected readonly sortLabels = TRADE_SORT_LABELS;
  protected readonly defaults: TradesView = { tickers: [], sort: DEFAULT_TRADE_SORT };
  protected readonly draft = signal<TradesView>(this.context.view);

  /** Stocks traded in the period, plus any selected ones outside it so they can be unselected. */
  protected readonly options = computed(() => {
    const instruments = this.context.instruments();
    const known = new Set(instruments.map((i) => i.t212Ticker));
    const extra = this.draft()
      .tickers.filter((t) => !known.has(t))
      .map((t212Ticker) => ({ t212Ticker, symbol: null, name: '' }));
    return [...instruments, ...extra];
  });

  protected readonly summary = computed(() => {
    const options = this.options();
    return this.draft()
      .tickers.map((t) => {
        const option = options.find((o) => o.t212Ticker === t);
        return option ? displayTicker(option) : t;
      })
      .join(', ');
  });

  protected ticker(option: InstrumentOption): string {
    return displayTicker(option);
  }

  protected patch(patch: Partial<TradesView>): void {
    this.draft.update((view) => ({ ...view, ...patch }));
  }

  protected done(): void {
    this.context.change(this.draft());
    this.ref.dismiss();
  }
}
