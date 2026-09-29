import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { isApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { FollowTarget } from '../../core/services/follows.service';
import { APP_NAME } from '../../core/services/app-title.strategy';
import { NavigationService } from '../../core/services/navigation.service';
import { RecentSearchesService } from '../../core/services/recent-searches.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { FollowButton } from '../../shared/components/follow-button/follow-button';
import { PullToRefresh } from '../../shared/components/pull-to-refresh/pull-to-refresh';
import { RegionBadge } from '../../shared/components/region-badge/region-badge';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { PricePipe, SignedNumberPipe, PercentPipe } from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { EarningsHistory } from './sections/earnings-history';
import { EarningsStats } from './sections/earnings-stats';
import { KeyStats } from './sections/key-stats';
import { News } from './sections/news';
import { Notes } from './sections/notes';
import { Peers } from './sections/peers';
import { PerformanceHistory } from './sections/performance-history';
import { PerformanceSummary } from './sections/performance-summary';
import { PriceChart } from './sections/price-chart/price-chart';
import { Recommendations } from './sections/recommendations';
import { UpcomingEarnings } from './sections/upcoming-earnings';
import { StockContext } from './stock-context';

/**
 * `/stock/:symbol` (deep-linkable; the digest email links here). The overview fills the sticky header, key stats
 * and performance at once; the other sections load in parallel as they scroll into view, each with its own
 * loading and error state.
 */
@Component({
  selector: 'app-stock-detail-page',
  providers: [StockContext],
  imports: [
    RouterLink,
    MatButton,
    MatIconButton,
    Icon,
    StockLogo,
    RegionBadge,
    FollowButton,
    PullToRefresh,
    Skeleton,
    StaleChip,
    EmptyState,
    ErrorState,
    PricePipe,
    SignedNumberPipe,
    PercentPipe,
    KeyStats,
    PerformanceSummary,
    PriceChart,
    PerformanceHistory,
    UpcomingEarnings,
    EarningsHistory,
    EarningsStats,
    Recommendations,
    News,
    Peers,
    Notes,
  ],
  template: `
    <app-pull-to-refresh [refreshing]="overview.isLoading() && ctx.version() > 0" (refresh)="ctx.refresh()">
      <header class="sticky top-0 z-20 border-b border-outline-variant bg-surface/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-surface/85">
        <div class="mx-auto flex min-h-16 max-w-4xl items-center gap-2 py-2 pr-2 pl-1">
          <button matIconButton type="button" aria-label="Back" (click)="navigation.back('/search')">
            <app-icon name="arrow_back" />
          </button>
          <app-stock-logo [symbol]="ctx.symbol()" [logoUrl]="stock()?.logoUrl" [size]="36" />
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-lg leading-tight font-semibold">{{ ctx.symbol() }}</h1>
            @if (stock(); as s) {
              <p class="truncate text-xs text-on-surface-variant">{{ s.name }}</p>
            } @else if (!notFound()) {
              <app-skeleton class="mt-1 h-3 w-28" />
            }
          </div>
          @if (stock(); as s) {
            <div class="text-right tabular-nums">
              <p class="text-lg leading-tight font-semibold">{{ s.quote.price | price: s.currency }}</p>
              <p class="text-xs whitespace-nowrap" [class]="changeClass()">
                {{ s.quote.change | signed }} ({{ s.quote.changePercent | pct }})
              </p>
            </div>
          } @else if (!notFound()) {
            <div class="flex flex-col items-end gap-1"><app-skeleton class="h-5 w-20" /><app-skeleton class="h-3 w-24" /></div>
          }
          @if (!notFound()) {
            <app-follow-button class="sm:hidden" compact [target]="followTarget()" />
            <app-follow-button class="hidden sm:block" [target]="followTarget()" />
          }
          <button matIconButton type="button" class="hidden! lg:inline-flex!" aria-label="Refresh" (click)="ctx.refresh()">
            <app-icon name="refresh" />
          </button>
        </div>
      </header>

      <div class="mx-auto max-w-4xl pb-10">
        @if (notFound()) {
          <app-empty-state
            icon="search_off"
            title="Symbol not found"
            [text]="'We couldn’t find ' + ctx.symbol() + '. Check the ticker, e.g. SAP.DE for SAP in Frankfurt.'"
          >
            <a matButton="filled" routerLink="/search">Search stocks</a>
          </app-empty-state>
        } @else if (overview.error() && !stock()) {
          <div class="p-4"><app-error-state [error]="overview.error()" (retry)="overview.reload()" /></div>
        } @else {
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 pb-1 text-xs text-on-surface-variant">
            @if (stock(); as s) {
              <app-region-badge [region]="s.region" />
              <span>{{ s.exchange }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ s.currency }}</span>
              @if (s.sector || s.industry) {
                <span aria-hidden="true">·</span>
                <span>{{ s.sector }}{{ s.sector && s.industry ? ' / ' : '' }}{{ s.industry }}</span>
              }
              @if (s.stale) {
                <app-stale-chip class="basis-full pt-1" [asOf]="s.asOf" />
              }
            } @else {
              <app-skeleton class="h-4 w-56" />
            }
          </div>

          <app-key-stats [overview]="stock()" />
          <app-performance-summary [performance]="stock()?.performance" />

          @defer (on viewport; prefetch on idle) {
            <app-price-chart />
          } @placeholder {
            <div class="h-[25rem] border-t border-outline-variant sm:h-[27rem] lg:h-[31rem]"></div>
          }
          @defer (on viewport; prefetch on idle) {
            <app-performance-history />
          } @placeholder {
            <div class="h-14 border-t border-outline-variant"></div>
          }
          <app-upcoming-earnings [event]="stock()?.nextEarnings" [loading]="!stock()" />
          @defer (on viewport; prefetch on idle) {
            <app-earnings-history />
          } @placeholder {
            <div class="h-14 border-t border-outline-variant"></div>
          }
          <app-earnings-stats [stats]="stock()?.earningsStats" />
          @defer (on viewport; prefetch on idle) {
            <app-recommendations />
          } @placeholder {
            <div class="h-14 border-t border-outline-variant"></div>
          }
          @defer (on viewport; prefetch on idle) {
            <app-news />
          } @placeholder {
            <div class="h-14 border-t border-outline-variant"></div>
          }
          @defer (on viewport; prefetch on idle) {
            <app-peers />
          } @placeholder {
            <div class="h-14 border-t border-outline-variant"></div>
          }
          @defer (on viewport; prefetch on idle) {
            <app-notes />
          } @placeholder {
            <div class="h-14 border-t border-outline-variant"></div>
          }
        }
      </div>
    </app-pull-to-refresh>
  `,
})
export class StockDetailPage {
  protected readonly ctx = inject(StockContext);
  protected readonly navigation = inject(NavigationService);
  private readonly api = inject(ApiService);
  private readonly recent = inject(RecentSearchesService);
  private readonly title = inject(Title);

  /** Route parameter (`/stock/:symbol`). */
  readonly symbol = input.required<string>();

  protected readonly overview = this.ctx.resource((symbol, options) => this.api.overview(symbol, options));
  protected readonly stock = computed(() => (this.overview.hasValue() ? this.overview.value() : undefined));
  protected readonly notFound = computed(() => {
    const error = this.overview.error();
    return isApiError(error, 'SYMBOL_NOT_FOUND') || isApiError(error, 'BAD_REQUEST');
  });
  protected readonly followTarget = computed<FollowTarget | null>(() => {
    const s = this.stock();
    return s ? { symbol: s.symbol, name: s.name, exchange: s.exchange, region: s.region, logoUrl: s.logoUrl } : null;
  });
  protected readonly changeClass = computed(() => toneClass(this.stock()?.quote.change));

  constructor() {
    effect(() => {
      const symbol = this.symbol();
      untracked(() => this.ctx.setSymbol(symbol));
    });
    // Opening a stock records it in the recent searches (once it is known to exist).
    effect(() => {
      const s = this.stock();
      if (!s) return;
      untracked(() => {
        this.recent.record({ ...s });
        this.title.setTitle(`${s.symbol} · ${s.name} · ${APP_NAME}`);
      });
    });
  }
}
