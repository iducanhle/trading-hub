import { Component, WritableSignal, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CalendarFilters, DEFAULT_FILTERS } from './calendar-model';
import { FilterControls } from './filter-controls';
import { Dialog } from '../../shared/components/dialog/dialog';

/** Phone filters in a dialog; changes apply at once. */
@Component({
  selector: 'app-filter-sheet',
  imports: [Dialog, MatButton, FilterControls],
  template: `
    <app-dialog title="Filters" i18n-title>
      <app-filter-controls [filters]="filters" />
      <button dialogActions matButton="tonal" type="button" (click)="reset()">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button dialogActions matButton="filled" type="button" (click)="ref.close()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-dialog>
  `,
})
export class FilterSheet {
  protected readonly filters = inject<WritableSignal<CalendarFilters>>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<FilterSheet>);

  protected reset(): void {
    this.filters.set(DEFAULT_FILTERS);
  }
}
