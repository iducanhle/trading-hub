import { Component, WritableSignal, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { DEFAULT_EVENT_FILTERS, EventFilters } from './events-model';
import { EventsFilterControls } from './events-filter-controls';
import { Sheet } from '../../shared/components/sheet/sheet';

/** Phone filters in a bottom sheet; changes apply at once. */
@Component({
  selector: 'app-events-filter-sheet',
  imports: [Sheet, MatButton, EventsFilterControls],
  template: `
    <app-sheet title="Filters" i18n-title>
      <app-events-filter-controls [filters]="filters" />
      <button sheetActions matButton="tonal" type="button" (click)="reset()">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button sheetActions matButton="filled" type="button" (click)="ref.dismiss()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-sheet>
  `,
})
export class EventsFilterSheet {
  protected readonly filters = inject<WritableSignal<EventFilters>>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<EventsFilterSheet>);

  protected reset(): void {
    this.filters.set(DEFAULT_EVENT_FILTERS);
  }
}
