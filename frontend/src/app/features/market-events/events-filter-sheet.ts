import { Component, WritableSignal, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DEFAULT_EVENT_FILTERS, EventFilters } from './events-model';
import { EventsFilterControls } from './events-filter-controls';
import { Dialog } from '../../shared/components/dialog/dialog';

/** Phone filters in a dialog; changes apply at once. */
@Component({
  selector: 'app-events-filter-sheet',
  imports: [Dialog, MatButton, EventsFilterControls],
  template: `
    <app-dialog title="Filters" i18n-title>
      <app-events-filter-controls [filters]="filters" />
      <button dialogActions matButton="tonal" type="button" (click)="reset()">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button dialogActions matButton="filled" type="button" (click)="ref.close()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-dialog>
  `,
})
export class EventsFilterSheet {
  protected readonly filters = inject<WritableSignal<EventFilters>>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<EventsFilterSheet>);

  protected reset(): void {
    this.filters.set(DEFAULT_EVENT_FILTERS);
  }
}
