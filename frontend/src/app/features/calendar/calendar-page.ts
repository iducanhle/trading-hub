import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { CalendarQuery } from '../../core/api/api.service';
import { CalendarDay } from '../../core/models/contract';
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
import { CalendarCache } from './calendar-cache';
import {
  CalendarFilters,
  CalendarView,
  DEFAULT_FILTERS,
  filtersAreDefault,
  rangeFor,
  shiftAnchor,
} from './calendar-model';
import { DaySheet, DaySheetData } from './day-sheet';
import { FilterControls } from './filter-controls';
import { FilterSheet } from './filter-sheet';
import { MonthView } from './month-view';
import { WeekView } from './week-view';

/**
 * `/calendar`: earnings reports by week (phones) or month (desktop), with previous / next / today navigation,
 * swipe, filters (bottom sheet on phones, inline from `lg`, remembered), and a sheet with each day's reports.
 * Fetched ranges are kept for the session and the neighbouring ranges are prefetched.
 */
@Component({
  selector: 'app-calendar-page',
  imports: [
    MatButton,
    MatIconButton,
    MatButtonToggleGroup,
    MatButtonToggle,
    Icon,
    PageHeader,
    PullToRefresh,
    Skeleton,
    EmptyState,
    ErrorState,
    Swipe,
    FilterControls,
    WeekView,
    MonthView,
  ],
  template: `
    <app-pull-to-refresh [refreshing]="refreshing()" (refresh)="refresh()">
      <app-page-header title="Calendar" maxWidth="max-w-6xl">
        <div actions class="flex items-center">
          <button matButton type="button" (click)="goToday()" [disabled]="showsToday()">
            Today
          </button>
          <button
            matIconButton
            type="button"
            class="lg:hidden!"
            [attr.aria-label]="filtersActive() ? 'Filters (active)' : 'Filters'"
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
          <button matIconButton type="button" aria-label="Refresh" (click)="refresh()">
            <app-icon name="refresh" [class.animate-spin]="data.isLoading()" />
          </button>
        </div>
        <div class="mx-auto flex max-w-6xl items-center gap-1 px-2 pb-2">
          <button
            matIconButton
            type="button"
            [attr.aria-label]="view() === 'week' ? 'Previous week' : 'Previous month'"
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
            [attr.aria-label]="view() === 'week' ? 'Next week' : 'Next month'"
            (click)="step(1)"
          >
            <app-icon name="chevron_right" />
          </button>
          <mat-button-toggle-group
            class="ml-auto"
            hideSingleSelectionIndicator
            aria-label="Calendar view"
            [value]="view()"
            (change)="view.set($event.value)"
          >
            <mat-button-toggle value="week">Week</mat-button-toggle>
            <mat-button-toggle value="month">Month</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <div class="mx-auto hidden max-w-6xl px-4 pb-3 lg:block">
          <app-filter-controls [filters]="filters" [inline]="true" />
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
              icon="event"
              title="No earnings in this period"
              [text]="
                filtersActive()
                  ? 'Try a lower market cap, another region, or all stocks.'
                  : 'Reports appear here as companies announce their dates.'
              "
            >
              @if (filtersActive()) {
                <button matButton="outlined" type="button" (click)="filters.set(defaultFilters)">
                  Reset filters
                </button>
              }
            </app-empty-state>
          } @else if (view() === 'week') {
            <app-week-view
              [calendarDays]="days()!"
              [followed]="followed()"
              [today]="today"
              (openDay)="openDay($event)"
            />
          } @else {
            <app-month-view
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
export class CalendarPage {
  private readonly cache = inject(CalendarCache);
  private readonly sheet = inject(MatBottomSheet);
  private readonly follows = inject(FollowsService);

  protected readonly today = todayIso();
  protected readonly defaultFilters = DEFAULT_FILTERS;
  protected readonly view = signal<CalendarView>(
    matchMedia('(min-width: 64rem)').matches ? 'month' : 'week',
  );
  protected readonly anchor = signal(this.today);
  protected readonly filters = persistedSignal<CalendarFilters>(
    'et.calendarFilters',
    DEFAULT_FILTERS,
  );
  private readonly version = signal(0);

  protected readonly range = computed(() => rangeFor(this.view(), this.anchor()));
  private readonly query = computed<CalendarQuery>(() => ({ ...this.range(), ...this.filters() }));

  protected readonly data = rxResource({
    params: () => ({ query: this.query(), version: this.version() }),
    stream: ({ params }) => this.cache.load(params.query),
  });
  protected readonly days = computed(() =>
    this.data.hasValue() ? this.data.value().days : undefined,
  );
  protected readonly isEmpty = computed(() => !!this.days()?.every((d) => d.events.length === 0));
  protected readonly followed = computed(() => this.follows.symbols());
  protected readonly filtersActive = computed(() => !filtersAreDefault(this.filters()));
  protected readonly refreshing = computed(() => this.data.isLoading() && this.version() > 0);

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
    this.sheet.open(FilterSheet, { data: this.filters, ariaLabel: 'Filters' });
  }

  protected openDay(day: CalendarDay): void {
    const data: DaySheetData = { day, followed: this.followed() };
    this.sheet.open(DaySheet, { data, ariaLabel: 'Reports of the day' });
  }
}
