import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { SORT_LABELS } from './portfolio-labels';
import { StockSort } from './portfolio-model';

export interface StocksView {
  /** Profit/loss includes unrealized. */
  unrealized: boolean;
  sort: StockSort;
}

export const DEFAULT_STOCKS_VIEW: StocksView = { unrealized: false, sort: 'pnl' };

export const STOCK_SORTS: readonly StockSort[] = ['pnl', 'pnlPct', 'value', 'lastTrade', 'name'];

export interface StocksFilterContext {
  view: StocksView;
  change: (view: StocksView) => void;
}

/** Profit/loss basis and sort of the Stocks tab in a bottom sheet; a draft until Done. */
@Component({
  selector: 'app-stocks-filter-sheet',
  imports: [
    MatButton,
    MatButtonToggleGroup,
    MatButtonToggle,
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption,
  ],
  template: `
    <div class="px-4 pb-safe">
      <div
        class="mx-auto mt-1 mb-3 h-1 w-8 rounded-full bg-outline-variant"
        aria-hidden="true"
      ></div>
      <h2 class="mb-4 text-lg font-semibold" i18n>Filters</h2>
      <div class="flex flex-col gap-3">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          aria-label="Profit and loss"
          i18n-aria-label
          [value]="draft().unrealized"
          (change)="patch({ unrealized: $event.value })"
        >
          <mat-button-toggle [value]="false" i18n="Profit/loss basis|Realized only"
            >Without</mat-button-toggle
          >
          <mat-button-toggle [value]="true" i18n="Profit/loss basis|Includes unrealized"
            >With unrealized</mat-button-toggle
          >
        </mat-button-toggle-group>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n>Sort</mat-label>
          <mat-select [value]="draft().sort" (selectionChange)="patch({ sort: $event.value })">
            @for (option of sorts; track option) {
              <mat-option [value]="option">{{ sortLabels[option] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <div class="mt-6 mb-4 flex justify-between gap-3">
        <button matButton type="button" (click)="draft.set(defaults)" i18n>Reset</button>
        <button matButton="filled" type="button" (click)="done()" i18n>Done</button>
      </div>
    </div>
  `,
})
export class StocksFilterSheet {
  private readonly context = inject<StocksFilterContext>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<StocksFilterSheet>);

  protected readonly sorts = STOCK_SORTS;
  protected readonly sortLabels = SORT_LABELS;
  protected readonly defaults = DEFAULT_STOCKS_VIEW;
  protected readonly draft = signal<StocksView>(this.context.view);

  protected patch(patch: Partial<StocksView>): void {
    this.draft.update((view) => ({ ...view, ...patch }));
  }

  protected done(): void {
    this.context.change(this.draft());
    this.ref.dismiss();
  }
}
