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
import { todayIso } from '../../shared/utils/dates';
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
      <app-page-header title="Followed">
        <button actions matIconButton type="button" aria-label="Refresh" (click)="refresh()">
          <app-icon name="refresh" [class.animate-spin]="data.isLoading()" />
        </button>
      </app-page-header>

      <div class="mx-auto max-w-2xl px-2 pb-8">
        @if (data.error() && !view()) {
          <div class="px-2 pt-4">
            <app-error-state [error]="data.error()" (retry)="refresh()" />
          </div>
        } @else if (!view()) {
          <div class="px-2" aria-hidden="true">
            <app-skeleton class="mt-4 mb-3 h-4 w-24" />
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="flex h-20 items-center gap-3">
                <app-skeleton shape="circle" class="size-10" />
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
            text="Follow stocks from their page to see their next earnings dates here."
          >
            <a matButton="filled" routerLink="/search">
              <app-icon matButtonIcon name="search" [size]="18" />
              Find stocks
            </a>
          </app-empty-state>
        } @else {
          @for (group of view()!.groups; track group.title) {
            <section [attr.aria-label]="group.title">
              <h2 class="px-3 pt-4 pb-1 text-sm font-semibold text-on-surface-variant">
                {{ group.title }} <span class="font-normal">· {{ group.events.length }}</span>
              </h2>
              <ul>
                @for (e of group.events; track e.symbol) {
                  <li class="flex items-center">
                    <a
                      [routerLink]="['/stock', e.symbol]"
                      class="flex min-h-18 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-container-high"
                    >
                      <app-stock-logo [symbol]="e.symbol" [logoUrl]="e.logoUrl" [size]="40" />
                      <span class="min-w-0 flex-1">
                        <span class="block font-semibold">{{ e.symbol }}</span>
                        <span class="block truncate text-sm text-on-surface-variant">{{
                          e.name
                        }}</span>
                        <span class="block truncate text-xs text-on-surface-variant">
                          {{ e.time | reportTime }} · EPS est.
                          {{ e.epsEstimate | price: e.currency }}
                        </span>
                      </span>
                      <span class="shrink-0 text-right">
                        <span class="block text-sm font-medium">{{ e.date | appDate: 'day' }}</span>
                        <span class="block text-xs font-medium text-primary">{{
                          e.date | relativeDay
                        }}</span>
                      </span>
                    </a>
                    <button
                      matIconButton
                      type="button"
                      [matMenuTriggerFor]="rowMenu"
                      [matMenuTriggerData]="{ symbol: e.symbol }"
                      [attr.aria-label]="'More actions for ' + e.symbol"
                    >
                      <app-icon name="more_vert" />
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
          @if (view()!.noDate.length) {
            <section aria-label="No date announced">
              <h2 class="px-3 pt-4 pb-1 text-sm font-semibold text-on-surface-variant">
                No date announced <span class="font-normal">· {{ view()!.noDate.length }}</span>
              </h2>
              <ul>
                @for (s of view()!.noDate; track s.symbol) {
                  <li class="flex items-center">
                    <a
                      [routerLink]="['/stock', s.symbol]"
                      class="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-container-high"
                    >
                      <app-stock-logo [symbol]="s.symbol" [logoUrl]="s.logoUrl" [size]="40" />
                      <span class="min-w-0 flex-1">
                        <span class="block font-semibold">{{ s.symbol }}</span>
                        <span class="block truncate text-sm text-on-surface-variant">{{
                          s.name
                        }}</span>
                      </span>
                    </a>
                    <button
                      matIconButton
                      type="button"
                      [matMenuTriggerFor]="rowMenu"
                      [matMenuTriggerData]="{ symbol: s.symbol }"
                      [attr.aria-label]="'More actions for ' + s.symbol"
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
          <span>Open {{ symbol }}</span>
        </a>
        <button mat-menu-item type="button" (click)="unfollow(symbol)">
          <app-icon name="star" class="mr-3" />
          <span>Unfollow</span>
        </button>
      </ng-template>
    </mat-menu>
  `,
})
export class FollowedPage {
  private readonly api = inject(ApiService);
  private readonly follows = inject(FollowsService);

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
