import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { Router } from '@angular/router';
import { MarketEvent, MarketEventDay } from '../../core/models/contract';
import { AppDatePipe, ReportTimePipe } from '../../shared/pipes/format.pipes';
import { formatTime } from '../../shared/utils/dates';
import { EventBadge } from './event-badge';
import {
  categoryLabel,
  chronological,
  countryLabel,
  eventCount,
  importanceLabel,
  notableMove,
} from './events-model';
import { Sheet } from '../../shared/components/sheet/sheet';

export interface EventsDaySheetData {
  day: MarketEventDay;
  followed: ReadonlySet<string>;
}

/** Bottom sheet with every event of a day: all-day ones first, then by time in the device's time zone. */
@Component({
  selector: 'app-events-day-sheet',
  imports: [Sheet, NgTemplateOutlet, EventBadge, AppDatePipe, ReportTimePipe],
  template: `
    <app-sheet>
      <div class="flex items-baseline justify-between gap-3 pb-2">
        <h2 class="text-[22px] leading-tight font-bold">{{ data.day.date | appDate: 'long' }}</h2>
        <span class="shrink-0 text-sm font-semibold text-on-surface-variant">{{ count() }}</span>
      </div>
      <ul class="-mx-4">
        @for (e of events(); track e.id) {
          <li>
            @if (e.symbol) {
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5 text-left hover:bg-surface-container-high"
                (click)="openStock(e.symbol)"
              >
                <ng-container *ngTemplateOutlet="row; context: { $implicit: e }" />
              </button>
            } @else {
              <div class="flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5">
                <ng-container *ngTemplateOutlet="row; context: { $implicit: e }" />
              </div>
            }
          </li>
        } @empty {
          <li class="px-4 py-6 text-sm text-on-surface-variant" i18n>No events on this day.</li>
        }
      </ul>
    </app-sheet>

    <ng-template #row let-e>
      <app-event-badge [event]="e" [size]="44" [followed]="data.followed.has(e.symbol ?? '')" />
      <span class="min-w-0 flex-1">
        <span class="block app-row-title">{{ e.title }}</span>
        <span class="block app-row-meta">{{ details(e) }}</span>
        @if (e.note) {
          <span class="mt-0.5 block text-xs text-on-surface-variant">{{ e.note }}</span>
        }
        @if (move(e); as ratio) {
          <span class="mt-0.5 block text-xs text-on-surface-variant" i18n
            >Moves the S&P 500 about {{ ratio }} as much as a normal day</span
          >
        }
      </span>
      <span class="shrink-0 text-right text-xs text-on-surface-variant">
        <span class="block font-medium">{{ importance(e) }}</span>
        @if (e.reportTime) {
          <span class="block">{{ e.reportTime | reportTime }}</span>
        }
      </span>
    </ng-template>
  `,
})
export class EventsDaySheet {
  protected readonly data = inject<EventsDaySheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<EventsDaySheet>);
  private readonly router = inject(Router);

  protected readonly events = computed(() => chronological(this.data.day.events));
  protected readonly count = computed(() => eventCount(this.data.day.events.length));

  /** `14:30 · Inflation · United States`; all-day events and reports have no clock time. */
  protected details(event: MarketEvent): string {
    const parts = [
      event.startsAt ? formatTime(event.startsAt) : null,
      categoryLabel(event.category),
      countryLabel(event.country),
    ];
    return parts.filter(Boolean).join(' · ');
  }

  protected importance(event: MarketEvent): string {
    return importanceLabel(event.importance);
  }

  protected move(event: MarketEvent): string | null {
    return notableMove(event.moveRatio);
  }

  protected openStock(symbol: string): void {
    this.ref.dismiss();
    void this.router.navigate(['/stock', symbol]);
  }
}
