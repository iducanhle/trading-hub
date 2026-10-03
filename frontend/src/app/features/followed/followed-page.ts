import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { SearchResult } from '../../core/models/contract';
import { FollowsService } from '../../core/services/follows.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PullToRefresh } from '../../shared/components/pull-to-refresh/pull-to-refresh';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import {
  AppDatePipe,
  PricePipe,
  RelativeDayPipe,
  ReportTimePipe,
} from '../../shared/pipes/format.pipes';
import { diffDays, todayIso } from '../../shared/utils/dates';
import { groupFollowed } from './followed-groups';

/** Automatic refetches for a follow the backend does not list yet: soon, then past its 1-minute follows cache. */
const AUTO_REFETCH_DELAYS_MS = [1500, 65_000];

/**
 * `/followed` (the start page): upcoming reports of followed stocks grouped by week, then those without a date.
 * The follows listener keeps it in sync with other devices: removed stocks disappear at once, added ones are
 * listed right away and the list is fetched again shortly after.
 */
@Component({
  selector: 'app-followed-page',
  imports: [
    RouterLink,
    MatButton,
    MatIconButton,
    MatMenu,
    MatMenuContent,
    MatMenuItem,
    MatMenuTrigger,
    Icon,
    StockLogo,
    Skeleton,
    EmptyState,
    ErrorState,
    PageHeader,
    PullToRefresh,
    AppDatePipe,
    PricePipe,
    RelativeDayPipe,
    ReportTimePipe,
  ],
  template: `
    <app-pull-to-refresh [refreshing]="refreshing()" (refresh)="refresh()">
      <app-page-header title="Followed" i18n-title maxWidth="max-w-3xl">
        <button
          actions
          matIconButton
          type="button"
          aria-label="Refresh"
          i18n-aria-label
          (click)="refresh()"
        >
          <app-icon name="refresh" [class.animate-spin]="data.isLoading()" />
        </button>
      </app-page-header>

      <div class="mx-auto max-w-3xl px-4 pt-2 pb-10">
        @if (follows.error()) {
          <div class="px-2 pt-4">
            <app-error-state
              message="Couldn't load your followed stocks from the database."
              i18n-message
              (retry)="follows.retry()"
            />
          </div>
        } @else if (data.error() && !view()) {
          <div class="px-2 pt-4">
            <app-error-state [error]="data.error()" (retry)="refresh()" />
          </div>
        } @else if (!view()) {
          <div aria-hidden="true">
            <app-skeleton class="mt-4 mb-3 h-4 w-24" />
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="flex h-20 items-center gap-3">
                <app-skeleton class="size-12 rounded-[14px]" />
                <div class="flex-1 space-y-2">
                  <app-skeleton class="h-4 w-24" /><app-skeleton class="h-3 w-40" />
                </div>
                <app-skeleton class="h-4 w-16" />
              </div>
            }
          </div>
        } @else if (view()!.empty) {
          <app-empty-state
            icon="star"
            title="You're not following any stocks yet"
            i18n-title
            text="Follow stocks from their page to see their next earnings dates here."
            i18n-text
          >
            <a matButton="filled" routerLink="/search">
              <app-icon matButtonIcon name="search" [size]="18" />
              <ng-container i18n>Find stocks</ng-container>
            </a>
          </app-empty-state>
        } @else {
          @if (next(); as n) {
            <a
              [routerLink]="['/stock', n.event.symbol]"
              class="-mx-2 block rounded-[22px] px-2 py-1 hover:bg-surface-container"
            >
              <span class="app-label block" i18n>Next earnings</span>
              <span class="mt-1.5 flex items-center gap-3.5">
                <app-stock-logo [symbol]="n.event.symbol" [logoUrl]="n.event.logoUrl" [size]="48" />
                <span
                  class="min-w-0 truncate text-5xl leading-[1.05] font-light tracking-[-.02em]"
                  >{{ n.event.symbol }}</span
                >
              </span>
              <span class="mt-3.5 flex flex-wrap gap-x-8 gap-y-2">
                <span>
                  <span class="app-label block" i18n>Date</span>
                  <span class="mt-0.5 block text-[17px] font-semibold">{{
                    n.event.date | appDate: 'day'
                  }}</span>
                </span>
                <span>
                  <span class="app-label block" i18n>Time</span>
                  <span class="mt-0.5 block text-[17px] font-semibold">{{
                    n.event.time | reportTime
                  }}</span>
                </span>
              </span>
              <span
                class="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3.5 py-2 text-[12.5px] font-extrabold"
              >
                <span class="size-[9px] rounded-full bg-primary" aria-hidden="true"></span>
                {{ n.event.date | relativeDay }}
              </span>
            </a>
          }
          <div class="app-card mt-5">
            <h2 class="app-label" i18n>Followed stocks</h2>
            <p class="mt-0.5 text-lg font-bold">{{ count() }}</p>
            <a
              routerLink="/search"
              class="mt-3.5 flex h-[46px] items-center gap-2.5 rounded-[14px] bg-surface-container-high px-3.5 text-[15px] text-on-surface-variant hover:text-on-surface"
            >
              <app-icon name="search" [size]="20" />
              <ng-container i18n>Add a stock to follow</ng-container>
            </a>
          </div>
          @for (group of view()!.groups; track group.title) {
            <section class="app-card mt-3.5 pb-1.5" [attr.aria-label]="group.title">
              <h2 class="app-label">{{ group.title }} · {{ group.events.length }}</h2>
              <ul class="mt-1">
                @for (e of group.events; track e.symbol) {
                  <li class="flex items-center">
                    <a
                      [routerLink]="['/stock', e.symbol]"
                      class="-mx-2 flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl px-2 py-3.5 hover:bg-surface-container-high"
                    >
                      <app-stock-logo [symbol]="e.symbol" [logoUrl]="e.logoUrl" [size]="48" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-base font-semibold">{{ e.symbol }}</span>
                        <span
                          class="mt-0.5 block truncate text-[12.5px] font-semibold text-on-surface-variant"
                          >{{ e.name }} · {{ e.time | reportTime }}</span
                        >
                        <span class="block truncate text-xs font-semibold text-on-surface-variant">
                          <ng-container i18n
                            >EPS est. {{ e.epsEstimate | price: e.currency }}</ng-container
                          >
                        </span>
                      </span>
                      <span class="shrink-0 text-right">
                        <span class="block text-base font-semibold">{{
                          e.date | appDate: 'day'
                        }}</span>
                        <span class="mt-0.5 block text-[12.5px] font-bold text-primary">{{
                          e.date | relativeDay
                        }}</span>
                      </span>
                    </a>
                    <button
                      matIconButton
                      type="button"
                      class="-mr-3 text-on-surface-variant"
                      [matMenuTriggerFor]="rowMenu"
                      [matMenuTriggerData]="{ symbol: e.symbol }"
                      aria-label="More actions for {{ e.symbol }}"
                      i18n-aria-label
                    >
                      <app-icon name="more_vert" />
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
          @if (view()!.noDate.length) {
            <section class="app-card mt-3.5 pb-1.5" aria-label="No date announced" i18n-aria-label>
              <h2 class="app-label">
                <ng-container i18n>No date announced</ng-container> · {{ view()!.noDate.length }}
              </h2>
              <ul class="mt-1">
                @for (s of view()!.noDate; track s.symbol) {
                  <li class="flex items-center">
                    <a
                      [routerLink]="['/stock', s.symbol]"
                      class="-mx-2 flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl px-2 py-3.5 hover:bg-surface-container-high"
                    >
                      <app-stock-logo [symbol]="s.symbol" [logoUrl]="s.logoUrl" [size]="48" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-base font-semibold">{{ s.symbol }}</span>
                        <span
                          class="mt-0.5 block truncate text-[12.5px] font-semibold text-on-surface-variant"
                          >{{ s.name }}</span
                        >
                      </span>
                    </a>
                    <button
                      matIconButton
                      type="button"
                      class="-mr-3 text-on-surface-variant"
                      [matMenuTriggerFor]="rowMenu"
                      [matMenuTriggerData]="{ symbol: s.symbol }"
                      aria-label="More actions for {{ s.symbol }}"
                      i18n-aria-label
                    >
                      <app-icon name="more_vert" />
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
    </app-pull-to-refresh>

    <mat-menu #rowMenu="matMenu" xPosition="before">
      <ng-template matMenuContent let-symbol="symbol">
        <a mat-menu-item [routerLink]="['/stock', symbol]">
          <app-icon name="open_in_new" class="mr-3" />
          <span i18n>Open {{ symbol }}</span>
        </a>
        <button mat-menu-item type="button" (click)="unfollow(symbol)">
          <app-icon name="star" class="mr-3" />
          <span i18n>Unfollow</span>
        </button>
      </ng-template>
    </mat-menu>
  `,
})
export class FollowedPage {
  private readonly api = inject(ApiService);
  protected readonly follows = inject(FollowsService);

  /** Bumped by pull-to-refresh, Retry and follows the last response does not know yet. */
  private readonly fetches = signal(0);
  protected readonly data = rxResource({
    params: () => ({ n: this.fetches() }),
    stream: ({ params }) => this.api.followedEarnings({ force: params.n > 0 }),
  });

  private readonly followedMap = computed(
    () =>
      new Map<string, SearchResult>(
        this.follows.follows().map((f) => [f.symbol, { ...f, currency: '' }]),
      ),
  );

  protected readonly view = computed(() => {
    const response = this.data.hasValue() ? this.data.value() : undefined;
    if (!response || !this.follows.loaded()) return undefined;
    return groupFollowed(response, this.followedMap(), todayIso());
  });

  protected readonly refreshing = computed(() => this.data.isLoading() && this.fetches() > 0);
  /** How many followed stocks the page lists. */
  protected readonly count = computed(() => {
    const v = this.view();
    return v ? v.groups.reduce((sum, g) => sum + g.events.length, 0) + v.noDate.length : 0;
  });
  /** The soonest report among the followed stocks, with the days left until it. */
  protected readonly next = computed(() => {
    const event = this.view()?.groups[0]?.events[0];
    return event ? { event, days: diffDays(todayIso(), event.date) } : null;
  });

  /** Automatic refetches for the current set of follows (capped, so a lagging backend cannot cause a loop). */
  private autoFetchKey = '';
  private autoFetches = 0;

  constructor() {
    // A stock followed on this or another device that the last response does not include: it is listed at once
    // (from the follows listener) and fetched again shortly after, then once more after the backend's 1-minute
    // cache of the user's follows has expired.
    effect((onCleanup) => {
      const followed = this.followedMap();
      const response = this.data.hasValue() ? this.data.value() : undefined;
      if (!response || !this.follows.loaded() || this.data.isLoading()) return;
      const key = [...followed.keys()].sort().join();
      if (key !== this.autoFetchKey) {
        this.autoFetchKey = key;
        this.autoFetches = 0;
      }
      const known = new Set(
        [...response.upcoming, ...response.noUpcomingDate].map((s) => s.symbol),
      );
      const delay = AUTO_REFETCH_DELAYS_MS[this.autoFetches];
      if (delay === undefined || ![...followed.keys()].some((s) => !known.has(s))) return;
      const timer = setTimeout(() => {
        this.autoFetches++;
        untracked(() => this.refresh());
      }, delay);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected refresh(): void {
    this.fetches.update((n) => n + 1);
  }

  protected unfollow(symbol: string): void {
    this.follows.unfollow(symbol).catch(() => undefined);
  }
}
