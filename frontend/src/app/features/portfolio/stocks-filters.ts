import { Component, Signal, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { SORT_LABELS } from './portfolio-labels';
import { SortDirection, StockSort, defaultSortDirection, displayTicker } from './portfolio-model';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { InstrumentOption } from './trades-filters';
import { Dialog } from '../../shared/components/dialog/dialog';

export interface StocksView {
  /** t212Tickers; empty = all stocks. */
  tickers: string[];
  sort: StockSort;
  direction: SortDirection;
}

export const DEFAULT_STOCKS_VIEW: StocksView = { tickers: [], sort: 'pnl', direction: 'desc' };

export const STOCK_SORTS: readonly StockSort[] = ['pnl', 'pnlPct', 'value', 'lastTrade', 'name'];

export interface StocksFilterContext {
  view: StocksView;
  instruments: Signal<InstrumentOption[]>;
  change: (view: StocksView) => void;
}

/** Stocks (multi-select, as on the Trades tab) and sort of the Stocks tab in a bottom sheet; a draft until Done. */
@Component({
  selector: 'app-stocks-filter-sheet',
  imports: [Dialog, Segmented, Segment, MatButton, MatFormField, MatLabel, MatSelect, MatSelectTrigger, MatOption],
  template: `
    <app-dialog title="Filters" i18n-title>
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
              <mat-option disabled i18n>No stocks in this period</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n>Sort</mat-label>
          <mat-select [value]="draft().sort" (selectionChange)="setSort($event.value)">
            @for (option of sorts; track option) {
              <mat-option [value]="option">{{ sortLabels[option] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <app-segmented
          inset
          stretch
          aria-label="Sort direction"
          i18n-aria-label
          [value]="draft().direction"
          (valueChange)="patch({ direction: $event })"
        >
          <app-segment value="desc" i18n="Sort direction: highest, newest or Z first">Descending</app-segment>
          <app-segment value="asc" i18n="Sort direction: lowest, oldest or A first">Ascending</app-segment>
        </app-segmented>
      </div>
      <button dialogActions matButton="tonal" type="button" (click)="draft.set(defaults)">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button dialogActions matButton="filled" type="button" (click)="done()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-dialog>
  `,
})
export class StocksFilterSheet {
  private readonly context = inject<StocksFilterContext>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<StocksFilterSheet>);

  protected readonly sorts = STOCK_SORTS;
  protected readonly sortLabels = SORT_LABELS;
  protected readonly defaults = DEFAULT_STOCKS_VIEW;
  protected readonly draft = signal<StocksView>(this.context.view);

  /** Stocks of the period, plus any selected ones outside it so they can be unselected. */
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

  protected patch(patch: Partial<StocksView>): void {
    this.draft.update((view) => ({ ...view, ...patch }));
  }

  /** A new sort starts in its natural direction. */
  protected setSort(sort: StockSort): void {
    this.patch({ sort, direction: defaultSortDirection(sort) });
  }

  protected done(): void {
    this.context.change(this.draft());
    this.ref.close();
  }
}
