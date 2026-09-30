import { Component, input, output } from '@angular/core';
import { CalendarDay } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { WEEKDAYS_SHORT, formatDate, isWeekend } from '../../shared/utils/dates';
import { reportCount } from './calendar-model';

const MAX_LOGOS = 3;

/** Month view: a Monday-first 6-week grid; each day shows up to 3 logos and "+N". Weekends are narrower and dimmed. */
@Component({
  selector: 'app-month-view',
  imports: [StockLogo],
  template: `
    <div class="px-2 sm:px-4">
      <div
        class="grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] pb-1 text-center text-xs font-medium text-on-surface-variant"
        aria-hidden="true"
      >
        @for (d of weekdays; track d) {
          <span>{{ d }}</span>
        }
      </div>
      <div
        class="grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.6fr))] gap-px overflow-hidden rounded-2xl border border-outline-variant bg-outline-variant"
      >
        @for (day of calendarDays(); track day.date) {
          @let weekend = isWeekend(day.date);
          @let outside = day.date.slice(0, 7) !== month();
          @let isToday = day.date === today();
          <button
            type="button"
            class="flex min-h-18 flex-col items-center gap-1 p-1 text-left hover:bg-surface-container-high sm:min-h-24 sm:items-start sm:p-1.5"
            [class.bg-surface]="!weekend && !outside"
            [class.bg-surface-container-low]="weekend && !outside"
            [class.bg-surface-container-high]="outside"
            [attr.aria-label]="label(day)"
            (click)="openDay.emit(day)"
          >
            <span
              class="flex size-6 items-center justify-center rounded-full text-xs tabular-nums"
              [class.bg-primary]="isToday"
              [class.text-on-primary]="isToday"
              [class.font-semibold]="isToday"
              [class.text-on-surface-variant]="!isToday && weekend"
              >{{ +day.date.slice(8) }}</span
            >
            @if (day.events.length) {
              <span
                class="flex flex-wrap justify-center gap-0.5 sm:justify-start"
                aria-hidden="true"
              >
                @for (e of day.events.slice(0, maxLogos); track e.symbol) {
                  <app-stock-logo
                    [symbol]="e.symbol"
                    [logoUrl]="e.logoUrl"
                    [size]="20"
                    [followed]="followed().has(e.symbol)"
                  />
                }
              </span>
              @if (day.events.length > maxLogos) {
                <span class="text-[10px] font-medium text-on-surface-variant" aria-hidden="true"
                  >+{{ day.events.length - maxLogos }}</span
                >
              }
            }
          </button>
        }
      </div>
    </div>
  `,
})
export class MonthView {
  readonly calendarDays = input.required<CalendarDay[]>();
  /** 'YYYY-MM' of the month shown; other days of the grid are shaded. */
  readonly month = input.required<string>();
  readonly followed = input.required<ReadonlySet<string>>();
  readonly today = input.required<string>();
  readonly openDay = output<CalendarDay>();

  protected readonly weekdays = WEEKDAYS_SHORT;
  protected readonly maxLogos = MAX_LOGOS;
  protected readonly isWeekend = isWeekend;

  protected label(day: CalendarDay): string {
    const n = day.events.length;
    return `${formatDate(day.date, 'long')}, ${reportCount(n)}`;
  }
}
