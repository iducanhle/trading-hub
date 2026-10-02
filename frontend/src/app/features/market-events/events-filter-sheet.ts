import { Component, WritableSignal, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { DEFAULT_EVENT_FILTERS, EventFilters } from './events-model';
import { EventsFilterControls } from './events-filter-controls';

/** Phone filters in a bottom sheet; changes apply at once. */
@Component({
  selector: 'app-events-filter-sheet',
  imports: [MatButton, EventsFilterControls],
  template: `
    <div class="px-4 pb-safe">
      <div
        class="mx-auto mt-1 mb-3 h-1 w-8 rounded-full bg-outline-variant"
        aria-hidden="true"
      ></div>
      <h2 class="mb-4 text-lg font-semibold" i18n>Filters</h2>
      <app-events-filter-controls [filters]="filters" />
      <div class="mt-6 mb-4 flex justify-between gap-3">
        <button matButton type="button" (click)="reset()" i18n>Reset</button>
        <button matButton="filled" type="button" (click)="ref.dismiss()" i18n>Done</button>
      </div>
    </div>
  `,
})
export class EventsFilterSheet {
  protected readonly filters = inject<WritableSignal<EventFilters>>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<EventsFilterSheet>);

  protected reset(): void {
    this.filters.set(DEFAULT_EVENT_FILTERS);
  }
}
