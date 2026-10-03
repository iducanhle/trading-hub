import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MarketEventsQuery } from '../../core/api/api.service';
import { MarketEventDay } from '../../core/models/contract';
import { FollowsService } from '../../core/services/follows.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PullToRefresh } from '../../shared/components/pull-to-refresh/pull-to-refresh';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Swipe } from '../../shared/directives/swipe';
import { Icon } from '../../shared/icon/icon';
import { formatDateRange, formatMonthTitle, todayIso } from '../../shared/utils/dates';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { CalendarView, rangeFor, shiftAnchor } from '../calendar/calendar-model';
import { EventsDaySheet, EventsDaySheetData } from './events-day-sheet';
import { MarketEventsCache } from './events-cache';
import { EventsFilterControls } from './events-filter-controls';
import { EventsFilterSheet } from './events-filter-sheet';
import { EventsMonthView } from './events-month-view';
import { DEFAULT_EVENT_FILTERS, EventFilters, eventFiltersAreDefault } from './events-model';
import { EventsWeekView } from './events-week-view';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

/**
 * `/events`: the events that tend to move the market (central banks, inflation, jobs, growth, Treasury, expiries,
 * mega-cap reports) by week (phones) or month (desktop), laid out like the earnings calendar: previous / next /
 * today, swipe, filters (bottom sheet on phones, inline from `lg`, remembered) and a sheet with each day's events.
 */
@Component({
  selector: 'app-events-page',
  imports: [
    MatButton,
    MatIconButton,
    Segmented,
    Segment,
    Icon,
    PageHeader,
    PullToRefresh,
    Skeleton,
    EmptyState,
    ErrorState,
    Swipe,
    EventsFilterControls,
    EventsWeekView,
    EventsMonthView,
  ],
  template: `
    <app-pull-to-refresh [refreshing]="refreshing()" (refresh)="refresh()">
      <app-page-header title="Events" i18n-title maxWidth="max-w-6xl">
        <div actions class="flex items-center">
          <button matButton type="button" (click)="goToday()" [disabled]="showsToday()" i18n>
            Today
          </button>
          <button
            matIconButton
            type="button"
            class="lg:hidden!"
            [attr.aria-label]="filtersActive() ? labels.filtersActive : labels.filters"
            (click)="openFilters()"
          >
            <span class="relative inline-flex">
              <app-icon name="tune" />
              @if (filtersActive()) {
                <span
                  class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary"
                  aria-hidden="true"
                ></span>
              }
            </span>
          </button>
          <button
            matIconButton
            type="button"
            aria-label="Refresh"
            i18n-aria-label
            (click)="refresh()"
          >
            <app-icon name="refresh" [class.animate-spin]="data.isLoading()" />
          </button>
        </div>
        <div class="mx-auto flex max-w-6xl items-center gap-1 px-2 pb-2">
          <button
            matIconButton
            type="button"
            [attr.aria-label]="view() === 'week' ? labels.previousWeek : labels.previousMonth"
            (click)="step(-1)"
          >
            <app-icon name="chevron_left" />
          </button>
          <h2
            class="min-w-0 flex-1 truncate text-center text-base font-semibold sm:flex-none sm:px-2"
            aria-live="polite"
          >
            <span class="sm:hidden">{{ shortTitle() }}</span
            ><span class="hidden sm:inline">{{ title() }}</span>
          </h2>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="view() === 'week' ? labels.nextWeek : labels.nextMonth"
            (click)="step(1)"
          >
            <app-icon name="chevron_right" />
          </button>
          <app-segmented
            class="ml-auto"
            aria-label="Calendar view"
            i18n-aria-label
            [value]="view()"
            (valueChange)="view.set($event)"
          >
            <app-segment value="week" i18n>Week</app-segment>
            <app-segment value="month" i18n>Month</app-segment>
          </app-segmented>
        </div>
        <div class="mx-auto hidden max-w-6xl px-4 pb-3 lg:block">
          <app-events-filter-controls [filters]="filters" [inline]="true" />
        </div>
      </app-page-header>

      <div class="mx-auto max-w-6xl pb-8" appSwipe (swipeLeft)="step(1)" (swipeRight)="step(-1)">
        @if (data.error() && !days()) {
          <div class="p-4"><app-error-state [error]="data.error()" (retry)="data.reload()" /></div>
        } @else if (!days()) {
          <div class="space-y-4 p-4" aria-hidden="true">
            @for (i of [1, 2, 3, 4, 5]; track i) {
              <div class="space-y-2">
                <app-skeleton class="h-5 w-32" />
                <div class="flex gap-3">
                  @for (j of [1, 2, 3, 4]; track j) {
                    <app-skeleton shape="circle" class="size-10" />
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          @if (isEmpty()) {
            <app-empty-state
              icon="bolt"
              title="No events in this period"
              i18n-title
              [text]="filtersActive() ? labels.emptyFiltered : labels.empty"
            >
              @if (filtersActive()) {
                <button
                  matButton="outlined"
                  type="button"
                  (click)="filters.set(defaultFilters)"
                  i18n
                >
                  Reset filters
                </button>
              }
            </app-empty-state>
          } @else if (view() === 'week') {
            <app-events-week-view
              [calendarDays]="days()!"
              [followed]="followed()"
              [today]="today"
              (openDay)="openDay($event)"
            />
          } @else {
            <app-events-month-view
              [calendarDays]="days()!"
              [month]="anchor().slice(0, 7)"
              [followed]="followed()"
              [today]="today"
              (openDay)="openDay($event)"
            />
          }
        }
      </div>
    </app-pull-to-refresh>
  `,
})
export class EventsPage {
  private readonly cache = inject(MarketEventsCache);
  private readonly sheet = inject(MatBottomSheet);
  private readonly follows = inject(FollowsService);

  protected readonly today = todayIso();
  protected readonly defaultFilters = DEFAULT_EVENT_FILTERS;
  protected readonly view = signal<CalendarView>(
    matchMedia('(min-width: 64rem)').matches ? 'month' : 'week',
  );
  protected readonly anchor = signal(this.today);
  protected readonly filters = persistedSignal<EventFilters>(
    'et.eventFilters',
    DEFAULT_EVENT_FILTERS,
  );
  private readonly version = signal(0);

  protected readonly range = computed(() => rangeFor(this.view(), this.anchor()));
  private readonly query = computed<MarketEventsQuery>(() => ({
    ...this.range(),
    ...this.filters(),
  }));

  protected readonly data = rxResource({
    params: () => ({ query: this.query(), version: this.version() }),
    stream: ({ params }) => this.cache.load(params.query),
  });
  protected readonly days = computed(() =>
    this.data.hasValue() ? this.data.value().days : undefined,
  );
  protected readonly isEmpty = computed(() => !!this.days()?.every((d) => d.events.length === 0));
  protected readonly followed = computed(() => this.follows.symbols());
  protected readonly filtersActive = computed(() => !eventFiltersAreDefault(this.filters()));
  protected readonly refreshing = computed(() => this.data.isLoading() && this.version() > 0);

  protected readonly labels = {
    filters: $localize`Filters`,
    filtersActive: $localize`Filters (active)`,
    previousWeek: $localize`Previous week`,
    previousMonth: $localize`Previous month`,
    nextWeek: $localize`Next week`,
    nextMonth: $localize`Next month`,
    emptyFiltered: $localize`Try a lower importance, another region, or show company earnings.`,
    empty: $localize`Events appear here as central banks and agencies publish their calendars.`,
  };

  protected readonly title = computed(() => {
    const { from, to } = this.range();
    return this.view() === 'month'
      ? formatMonthTitle(this.anchor())
      : formatDateRange(from, to, true);
  });
  /** Phones: the week range without the year when it is this year's. */
  protected readonly shortTitle = computed(() => {
    const { from, to } = this.range();
    const year = this.today.slice(0, 4);
    const sameYear = from.startsWith(year) && to.startsWith(year);
    return this.view() === 'week' && sameYear ? formatDateRange(from, to) : this.title();
  });
  protected readonly showsToday = computed(() => {
    const { from, to } = this.range();
    const inRange = this.today >= from && this.today <= to;
    return this.view() === 'week' ? inRange : this.anchor().slice(0, 7) === this.today.slice(0, 7);
  });

  constructor() {
    // Filters saved before a filter existed lack it.
    this.filters.update((f) => ({ ...DEFAULT_EVENT_FILTERS, ...f }));

    // Once a range is on screen, fetch its neighbours so swiping feels instant.
    effect(() => {
      if (!this.data.hasValue()) return;
      const view = this.view();
      const anchor = this.anchor();
      const filters = this.filters();
      untracked(() => {
        for (const step of [-1, 1]) {
          this.cache.prefetch({ ...rangeFor(view, shiftAnchor(view, anchor, step)), ...filters });
        }
      });
    });
  }

  protected step(direction: number): void {
    this.anchor.update((anchor) => shiftAnchor(this.view(), anchor, direction));
  }

  protected goToday(): void {
    this.anchor.set(this.today);
  }

  protected refresh(): void {
    this.cache.clear();
    this.version.update((v) => v + 1);
  }

  protected openFilters(): void {
    this.sheet.open(EventsFilterSheet, { data: this.filters, ariaLabel: this.labels.filters });
  }

  protected openDay(day: MarketEventDay): void {
    const data: EventsDaySheetData = { day, followed: this.followed() };
    this.sheet.open(EventsDaySheet, { data, ariaLabel: $localize`Events of the day` });
  }
}
