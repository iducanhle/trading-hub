import { Component, WritableSignal, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { CalendarFilters, DEFAULT_FILTERS } from './calendar-model';
import { FilterControls } from './filter-controls';

/** Phone filters in a bottom sheet; changes apply at once. */
@Component({
  selector: 'app-filter-sheet',
  imports: [MatButton, FilterControls],
  template: `
    <div class="px-4 pb-safe">
      <div
        class="mx-auto mt-1 mb-3 h-1 w-8 rounded-full bg-outline-variant"
        aria-hidden="true"
      ></div>
      <h2 class="mb-4 text-lg font-semibold">Filters</h2>
      <app-filter-controls [filters]="filters" />
      <div class="mt-6 mb-4 flex justify-between gap-3">
        <button matButton type="button" (click)="reset()">Reset</button>
        <button matButton="filled" type="button" (click)="ref.dismiss()">Done</button>
      </div>
    </div>
  `,
})
export class FilterSheet {
  protected readonly filters = inject<WritableSignal<CalendarFilters>>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<FilterSheet>);

  protected reset(): void {
    this.filters.set(DEFAULT_FILTERS);
  }
}
