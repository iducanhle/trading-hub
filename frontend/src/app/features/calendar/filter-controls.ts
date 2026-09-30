import { Component, WritableSignal, computed, input } from '@angular/core';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatChipListbox, MatChipListboxChange, MatChipOption } from '@angular/material/chips';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { RegionFilter } from '../../core/models/contract';
import { CAP_OPTIONS, CalendarFilters } from './calendar-model';

let nextId = 0;

/** Market cap, region and followed-only filters: stacked in the phone's bottom sheet, one row on desktop. */
@Component({
  selector: 'app-filter-controls',
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
          [id]="id + '-cap'"
        >
          Market cap
        </p>
        <mat-chip-listbox
          [attr.aria-labelledby]="id + '-cap'"
          [value]="value().minMarketCapUsd"
          (change)="setCap($event)"
        >
          @for (option of caps; track option.value) {
            <mat-chip-option [value]="option.value">{{ option.label }}</mat-chip-option>
          }
        </mat-chip-listbox>
      </div>
      <div>
        <p
          [class]="inline() ? 'mb-2 text-sm font-medium lg:sr-only' : 'mb-2 text-sm font-medium'"
          [id]="id + '-region'"
        >
          Region
        </p>
        <mat-button-toggle-group
          [attr.aria-labelledby]="id + '-region'"
          hideSingleSelectionIndicator
          [value]="value().region"
          (change)="setRegion($event.value)"
        >
          <mat-button-toggle value="ALL">All</mat-button-toggle>
          <mat-button-toggle value="US">US</mat-button-toggle>
          <mat-button-toggle value="EU">EU</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <mat-slide-toggle [checked]="value().followedOnly" (change)="setFollowedOnly($event.checked)">
        Followed only
      </mat-slide-toggle>
    </div>
  `,
})
export class FilterControls {
  readonly filters = input.required<WritableSignal<CalendarFilters>>();
  /** One row from `lg` (desktop bar) instead of a stack (bottom sheet). */
  readonly inline = input(false);

  protected readonly caps = CAP_OPTIONS;
  protected readonly value = computed(() => this.filters()());
  protected readonly id = `filters-${nextId++}`;

  protected setCap(event: MatChipListboxChange): void {
    // Tapping the selected chip again deselects it; keep the current value instead.
    if (typeof event.value === 'number') this.update({ minMarketCapUsd: event.value });
    else event.source.value = this.filters()().minMarketCapUsd;
  }

  protected setRegion(region: RegionFilter): void {
    this.update({ region });
  }

  protected setFollowedOnly(followedOnly: boolean): void {
    this.update({ followedOnly });
  }

  private update(patch: Partial<CalendarFilters>): void {
    this.filters().update((f) => ({ ...f, ...patch }));
  }
}
