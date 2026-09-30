import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarDay } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { AppDatePipe } from '../../shared/pipes/format.pipes';
import { formatDate } from '../../shared/utils/dates';
import { baseSymbol } from '../../shared/utils/symbols';
import { reportCount, visibleWeekDays } from './calendar-model';

const MAX_TILES = 8;

/**
 * Week view: one block per day (Monday–Friday, weekend days only with reports) with the reporting companies as
 * logo tiles, biggest first; after 8 a "+N" tile. The day header and "+N" open the day's full list.
 */
@Component({
  selector: 'app-week-view',
  imports: [RouterLink, StockLogo, Icon, AppDatePipe],
  template: `
    @for (day of days(); track day.date) {
      @let isToday = day.date === today();
      <section
        class="border-b border-outline-variant/70 px-2 py-2"
        [attr.aria-label]="day.date | appDate: 'long'"
      >
        <button
          type="button"
          class="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-surface-container-high"
          [attr.aria-label]="dayLabel(day)"
          (click)="openDay.emit(day)"
        >
          <span class="font-semibold" [class.text-primary]="isToday">{{
            day.date | appDate: 'weekday'
          }}</span>
          <span class="text-sm text-on-surface-variant">{{ day.date | appDate: 'dayMonth' }}</span>
          @if (isToday) {
            <span
              class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary"
              i18n
              >Today</span
            >
          }
          <span class="ml-auto text-sm text-on-surface-variant tabular-nums">{{
            day.events.length
          }}</span>
          <app-icon name="chevron_right" [size]="20" class="text-on-surface-variant" />
        </button>
        @if (day.events.length) {
          <ul class="grid grid-cols-5 gap-1 px-1 pb-1 sm:grid-cols-9">
            @for (e of day.events.slice(0, maxTiles); track e.symbol) {
              <li>
                <a
                  [routerLink]="['/stock', e.symbol]"
                  class="flex min-h-18 flex-col items-center justify-center gap-1 rounded-xl p-1 hover:bg-surface-container-high"
                  [attr.aria-label]="
                    e.symbol + ', ' + e.name + (followed().has(e.symbol) ? followedSuffix : '')
                  "
                >
                  <app-stock-logo
                    [symbol]="e.symbol"
                    [logoUrl]="e.logoUrl"
                    [size]="40"
                    [followed]="followed().has(e.symbol)"
                  />
                  <span class="max-w-full truncate text-[11px] font-medium">{{
                    short(e.symbol)
                  }}</span>
                </a>
              </li>
            }
            @if (day.events.length > maxTiles) {
              <li>
                <button
                  type="button"
                  class="flex min-h-18 w-full flex-col items-center justify-center rounded-xl p-1 hover:bg-surface-container-high"
                  aria-label="Show all {{ day.events.length }} reports"
                  i18n-aria-label
                  (click)="openDay.emit(day)"
                >
                  <span
                    class="flex size-10 items-center justify-center rounded-full bg-surface-container-highest text-sm font-semibold"
                    >+{{ day.events.length - maxTiles }}</span
                  >
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="px-2 pb-2 text-sm text-on-surface-variant" i18n>No reports</p>
        }
      </section>
    }
  `,
})
export class WeekView {
  readonly calendarDays = input.required<CalendarDay[]>();
  readonly followed = input.required<ReadonlySet<string>>();
  readonly today = input.required<string>();
  readonly openDay = output<CalendarDay>();

  protected readonly maxTiles = MAX_TILES;
  protected readonly days = computed(() => visibleWeekDays(this.calendarDays()));
  protected readonly followedSuffix = $localize`, followed`;

  protected dayLabel(day: CalendarDay): string {
    const date = formatDate(day.date, 'long');
    const count = reportCount(day.events.length);
    return $localize`${date}:date:, ${count}:count:. Show all`;
  }

  protected short(symbol: string): string {
    return baseSymbol(symbol);
  }
}
