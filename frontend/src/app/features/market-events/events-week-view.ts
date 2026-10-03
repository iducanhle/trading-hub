import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarketEvent, MarketEventDay } from '../../core/models/contract';
import { Icon } from '../../shared/icon/icon';
import { AppDatePipe } from '../../shared/pipes/format.pipes';
import { formatDate } from '../../shared/utils/dates';
import { visibleWeekDays } from '../calendar/calendar-model';
import { EventBadge } from './event-badge';
import { eventCount, importanceLabel } from './events-model';

const MAX_TILES = 8;

/**
 * Week view: one block per day (Monday–Friday, weekend days only with events) with the events as tiles, most
 * important first; after 8 a "+N" tile. Reports link to the stock, other tiles and the day header open the day's
 * full list.
 */
@Component({
  selector: 'app-events-week-view',
  imports: [RouterLink, EventBadge, Icon, AppDatePipe],
  template: `
    <ul class="grid grid-cols-7 gap-1 px-4 pt-3.5" aria-label="Days of the week" i18n-aria-label>
      @for (day of calendarDays(); track day.date) {
        @let isToday = day.date === today();
        <li>
          <button
            type="button"
            class="flex w-full flex-col items-center gap-0.5 rounded-2xl pt-2.5 pb-2"
            [class]="isToday ? 'bg-primary text-on-primary' : 'hover:bg-surface-container'"
            [attr.aria-label]="dayLabel(day)"
            (click)="jump(day)"
          >
            <span class="text-[11px] font-bold uppercase opacity-75">{{
              day.date | appDate: 'weekdayShort'
            }}</span>
            <span class="text-lg font-bold">{{ +day.date.slice(8) }}</span>
            <span
              class="size-[5px] rounded-full"
              [class]="
                day.events.length ? (isToday ? 'bg-on-primary' : 'bg-primary') : 'bg-transparent'
              "
              aria-hidden="true"
            ></span>
          </button>
        </li>
      }
    </ul>

    @for (day of days(); track day.date) {
      @let isToday = day.date === today();
      <section
        class="app-card mx-4 mt-3.5 scroll-mt-44 px-[18px] pt-2.5 pb-4"
        [id]="'day-' + day.date"
        [attr.aria-label]="day.date | appDate: 'long'"
      >
        <button
          type="button"
          class="-mx-2 flex min-h-11 w-[calc(100%+16px)] items-center gap-2 rounded-xl px-2 text-left hover:bg-surface-container-high"
          [attr.aria-label]="dayLabel(day)"
          (click)="openDay.emit(day)"
        >
          <span class="text-base font-bold capitalize" [class.text-primary]="isToday">{{
            day.date | appDate: 'weekday'
          }}</span>
          <span class="text-sm font-semibold text-on-surface-variant">{{
            day.date | appDate: 'dayMonth'
          }}</span>
          @if (isToday) {
            <span
              class="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary"
              i18n
              >Today</span
            >
          }
          <span class="app-label ml-auto">{{ day.events.length }}</span>
          <app-icon name="chevron_right" [size]="16" class="text-on-surface-variant" />
        </button>
        @if (day.events.length) {
          <ul class="mt-1.5 grid grid-cols-5 gap-x-1.5 gap-y-2.5 sm:grid-cols-9">
            @for (e of day.events.slice(0, maxTiles); track e.id) {
              <li>
                @if (e.symbol) {
                  <a
                    [routerLink]="['/stock', e.symbol]"
                    class="flex flex-col items-center gap-1.5 rounded-xl py-1 hover:bg-surface-container-high"
                    [attr.aria-label]="tileLabel(e)"
                  >
                    <app-event-badge
                      [event]="e"
                      [size]="50"
                      [followed]="followed().has(e.symbol)"
                    />
                    <span class="max-w-full truncate text-xs font-bold">{{ e.label }}</span>
                  </a>
                } @else {
                  <button
                    type="button"
                    class="flex w-full flex-col items-center gap-1.5 rounded-xl py-1 hover:bg-surface-container-high"
                    [attr.aria-label]="tileLabel(e)"
                    (click)="openDay.emit(day)"
                  >
                    <app-event-badge [event]="e" [size]="50" />
                    <span class="max-w-full truncate text-xs font-bold">{{ e.label }}</span>
                  </button>
                }
              </li>
            }
            @if (day.events.length > maxTiles) {
              <li>
                <button
                  type="button"
                  class="flex min-h-18 w-full flex-col items-center justify-center rounded-xl p-1 hover:bg-surface-container-high"
                  aria-label="Show all {{ day.events.length }} events"
                  i18n-aria-label
                  (click)="openDay.emit(day)"
                >
                  <span
                    class="flex size-[50px] items-center justify-center rounded-[15px] bg-surface-container-high text-sm font-bold"
                    >+{{ day.events.length - maxTiles }}</span
                  >
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="pt-1 text-sm font-semibold text-on-surface-variant" i18n>No events</p>
        }
      </section>
    }
  `,
})
export class EventsWeekView {
  readonly calendarDays = input.required<MarketEventDay[]>();
  readonly followed = input.required<ReadonlySet<string>>();
  readonly today = input.required<string>();
  readonly openDay = output<MarketEventDay>();

  protected readonly maxTiles = MAX_TILES;
  protected readonly days = computed(() => visibleWeekDays(this.calendarDays()));

  /** A day of the strip scrolls to its card; a weekend day without one opens its sheet instead. */
  protected jump(day: MarketEventDay): void {
    const card = document.getElementById('day-' + day.date);
    if (!card) {
      this.openDay.emit(day);
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  protected dayLabel(day: MarketEventDay): string {
    const date = formatDate(day.date, 'long');
    const count = eventCount(day.events.length);
    return $localize`${date}:date:, ${count}:count:. Show all`;
  }

  protected tileLabel(event: MarketEvent): string {
    const importance = importanceLabel(event.importance);
    return `${event.title}, ${importance}`;
  }
}
