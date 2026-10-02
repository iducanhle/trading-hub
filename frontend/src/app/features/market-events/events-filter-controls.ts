import { Component, WritableSignal, computed, input } from '@angular/core';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatChipListbox, MatChipListboxChange, MatChipOption } from '@angular/material/chips';
import { EventRegionFilter, Importance } from '../../core/models/contract';
import { EventFilters, IMPORTANCE_OPTIONS } from './events-model';

let nextId = 0;

/** Importance, region and earnings filters: stacked in the phone's bottom sheet, one row on desktop. */
@Component({
  selector: 'app-events-filter-controls',
  imports: [MatChipListbox, MatChipOption, MatButtonToggleGroup, MatButtonToggle, MatSlideToggle],
  template: `
    <div
      [class]="
        inline()
          ? 'flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-6'
          : 'flex flex-col gap-5'
      "
    >
      <div>
        <p
          [class]="inline() ? 'mb-2 text-sm font-medium lg:sr-only' : 'mb-2 text-sm font-medium'"
          [id]="id + '-importance'"
          i18n
        >
          Importance
        </p>
        <mat-chip-listbox
          [attr.aria-labelledby]="id + '-importance'"
          [value]="value().minImportance"
          (change)="setImportance($event)"
        >
          @for (option of options; track option.value) {
            <mat-chip-option [value]="option.value">{{ option.label }}</mat-chip-option>
          }
        </mat-chip-listbox>
      </div>
      <div>
        <p
          [class]="inline() ? 'mb-2 text-sm font-medium lg:sr-only' : 'mb-2 text-sm font-medium'"
          [id]="id + '-region'"
          i18n
        >
          Region
        </p>
        <mat-button-toggle-group
          [attr.aria-labelledby]="id + '-region'"
          hideSingleSelectionIndicator
          [value]="value().region"
          (change)="setRegion($event.value)"
        >
          <mat-button-toggle value="ALL" i18n="Region filter: every country">All</mat-button-toggle>
          <mat-button-toggle value="US">US</mat-button-toggle>
          <mat-button-toggle value="EU">EU</mat-button-toggle>
          <mat-button-toggle value="OTHER" i18n="Region filter: neither US nor EU"
            >Other</mat-button-toggle
          >
        </mat-button-toggle-group>
      </div>
      <mat-slide-toggle
        [checked]="value().includeEarnings"
        (change)="setIncludeEarnings($event.checked)"
      >
        <ng-container i18n>Company earnings</ng-container>
      </mat-slide-toggle>
    </div>
  `,
})
export class EventsFilterControls {
  readonly filters = input.required<WritableSignal<EventFilters>>();
  /** One row from `lg` (desktop bar) instead of a stack (bottom sheet). */
  readonly inline = input(false);

  protected readonly options = IMPORTANCE_OPTIONS;
  protected readonly value = computed(() => this.filters()());
  protected readonly id = `event-filters-${nextId++}`;

  protected setImportance(event: MatChipListboxChange): void {
    // Tapping the selected chip again deselects it; keep the current value instead.
    if (typeof event.value === 'string') this.update({ minImportance: event.value as Importance });
    else event.source.value = this.filters()().minImportance;
  }

  protected setRegion(region: EventRegionFilter): void {
    this.update({ region });
  }

  protected setIncludeEarnings(includeEarnings: boolean): void {
    this.update({ includeEarnings });
  }

  private update(patch: Partial<EventFilters>): void {
    this.filters().update((f) => ({ ...f, ...patch }));
  }
}
