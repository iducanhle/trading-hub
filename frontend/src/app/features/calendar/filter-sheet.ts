import { Component, WritableSignal, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { CalendarFilters, DEFAULT_FILTERS } from './calendar-model';
import { FilterControls } from './filter-controls';
import { Sheet } from '../../shared/components/sheet/sheet';

/** Phone filters in a bottom sheet; changes apply at once. */
@Component({
  selector: 'app-filter-sheet',
  imports: [Sheet, MatButton, FilterControls],
  template: `
    <app-sheet title="Filters" i18n-title>
      <app-filter-controls [filters]="filters" />
      <button sheetActions matButton="tonal" type="button" (click)="reset()">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button sheetActions matButton="filled" type="button" (click)="ref.dismiss()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-sheet>
  `,
})
export class FilterSheet {
  protected readonly filters = inject<WritableSignal<CalendarFilters>>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<FilterSheet>);

  protected reset(): void {
    this.filters.set(DEFAULT_FILTERS);
  }
}
