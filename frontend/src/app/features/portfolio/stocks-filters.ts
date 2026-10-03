import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { SORT_LABELS } from './portfolio-labels';
import { StockSort } from './portfolio-model';
import { Sheet } from '../../shared/components/sheet/sheet';

export interface StocksView {
  sort: StockSort;
}

export const DEFAULT_STOCKS_VIEW: StocksView = { sort: 'pnl' };

export const STOCK_SORTS: readonly StockSort[] = ['pnl', 'pnlPct', 'value', 'lastTrade', 'name'];

export interface StocksFilterContext {
  view: StocksView;
  change: (view: StocksView) => void;
}

/** Sort of the Stocks tab in a bottom sheet; a draft until Done. */
@Component({
  selector: 'app-stocks-filter-sheet',
  imports: [Sheet, MatButton, MatFormField, MatLabel, MatSelect, MatOption],
  template: `
    <app-sheet title="Filters" i18n-title>
      <div class="flex flex-col gap-3">
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
