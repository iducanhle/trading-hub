import { Component, WritableSignal, computed, input } from '@angular/core';
import { MatChipListbox, MatChipListboxChange, MatChipOption } from '@angular/material/chips';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { RegionFilter } from '../../core/models/contract';
import { CAP_OPTIONS, CalendarFilters } from './calendar-model';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

let nextId = 0;

/** Market cap, region and followed-only filters: stacked in the phone's bottom sheet, one row on desktop. */
@Component({
  selector: 'app-filter-controls',
  imports: [MatChipListbox, MatChipOption, Segmented, Segment, MatSlideToggle],
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
          [class]="inline() ? 'app-label mb-2.5 lg:sr-only' : 'app-label mb-2.5'"
          [id]="id + '-cap'"
          i18n
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
          [class]="inline() ? 'app-label mb-2.5 lg:sr-only' : 'app-label mb-2.5'"
          [id]="id + '-region'"
          i18n
        >
          Region
        </p>
        <app-segmented
          [attr.aria-labelledby]="id + '-region'"
          [inset]="!inline()"
          [stretch]="!inline()"
          [value]="value().region"
          (valueChange)="setRegion($event)"
        >
          <app-segment value="ALL" i18n="Region filter: US and EU">All</app-segment>
          <app-segment value="US">US</app-segment>
          <app-segment value="EU">EU</app-segment>
        </app-segmented>
      </div>
      <mat-slide-toggle [checked]="value().followedOnly" (change)="setFollowedOnly($event.checked)">
        <ng-container i18n>Followed only</ng-container>
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
