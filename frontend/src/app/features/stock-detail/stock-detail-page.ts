import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { Title } from '@angular/platform-browser';
import { isApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { FollowTarget } from '../../core/services/follows.service';
import { APP_NAME } from '../../core/services/app-title.strategy';
import { MenuService } from '../../core/services/menu.service';
import { NavigationService } from '../../core/services/navigation.service';
import { RecentSearchesService } from '../../core/services/recent-searches.service';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { FollowButton } from '../../shared/components/follow-button/follow-button';
import { PullToRefresh } from '../../shared/components/pull-to-refresh/pull-to-refresh';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { OpenSearch } from '../../shared/directives/open-search';
import { Icon } from '../../shared/icon/icon';
import { PricePipe } from '../../shared/pipes/format.pipes';
import { PortfolioNav } from '../portfolio/portfolio-nav';
import { EarningsHistory } from './sections/earnings-history';
import { EarningsStats } from './sections/earnings-stats';
import { KeyStats } from './sections/key-stats';
import { News } from './sections/news';
import { Notes } from './sections/notes';
import { Peers } from './sections/peers';
import { PerformanceHistory } from './sections/performance-history';
import { YourPosition } from './sections/your-position';
import { PriceChart } from './sections/price-chart/price-chart';
import { Recommendations } from './sections/recommendations';
import { StockContext } from './stock-context';

/**
 * `/stock/:symbol` (deep-linkable; the digest email links here). One scrolling page: price, chart, your position, key
 * stats, performance, analyst recommendations, earnings stats and history, peers, news and notes.
 * The overview response fills the header at once; the other sections load as they are shown, each with its own
 * loading and error state.
 */
@Component({
  selector: 'app-stock-detail-page',
  providers: [StockContext],
  imports: [
    OpenSearch,
    MatButton,
    MatIconButton,
    Icon,
    StockLogo,
    HeroAmount,
    FollowButton,
    PullToRefresh,
    Skeleton,
    StaleChip,
    EmptyState,
    ErrorState,
    PricePipe,
    KeyStats,
    YourPosition,
    PriceChart,
    PerformanceHistory,
    EarningsHistory,
    EarningsStats,
    Recommendations,
    News,
    Peers,
    Notes,
    PortfolioNav,
  ],
  template: `
    <app-pull-to-refresh
      [refreshing]="overview.isLoading() && ctx.version() > 0"
      (refresh)="ctx.refresh()"
    >
      <header
        class="sticky top-0 z-20 border-b border-outline-variant bg-surface/90 pt-safe backdrop-blur supports-[backdrop-filter]:bg-surface/80"
      >
        <div class="mx-auto flex h-16 max-w-4xl items-center gap-2 px-1.5">
          <button
            matIconButton
            type="button"
            class="lg:hidden!"
            aria-label="Open menu"
            i18n-aria-label
            (click)="menu.show()"
          >
            <app-icon name="menu" [size]="26" />
          </button>
          <div class="flex min-w-0 flex-1 justify-center">
            <h1
              class="flex min-w-0 items-center gap-2 rounded-full bg-surface-container-high px-3.5 py-2 text-sm font-bold"
            >
              <span
                class="size-[9px] shrink-0 rounded-full"
                [class]="stock() ? dotClass() : 'bg-on-surface-variant'"
                aria-hidden="true"
              ></span>
              <span class="truncate"
                >{{ ctx.symbol() }}
                @if (stock(); as s) {
                  · {{ s.quote.price | price: s.currency }}
                }
              </span>
            </h1>
          </div>
          <!-- T212 users search from the bottom pill. -->
          @if (!t212.connected()) {
            <button matIconButton type="button" appOpenSearch aria-label="Search" i18n-aria-label>
              <app-icon name="search" />
            </button>
          } @else {
            <!-- Balances the menu button so the title pill stays centred on phones. -->
            <span class="w-12 shrink-0 lg:hidden" aria-hidden="true"></span>
          }
          <button
            matIconButton
            type="button"
            class="hidden! lg:inline-flex!"
            aria-label="Refresh"
            i18n-aria-label
            (click)="ctx.refresh()"
          >
            <app-icon name="refresh" />
          </button>
        </div>
      </header>

      <div class="mx-auto max-w-4xl" [class]="t212.connected() ? 'pb-nav' : 'pb-end'">
        @if (notFound()) {
          <app-empty-state
            icon="search_off"
            title="Symbol not found"
            i18n-title
            text="We couldn’t find {{
              ctx.symbol()
            }}. Check the ticker, e.g. SAP.DE for SAP in Frankfurt."
            i18n-text
          >
            <button matButton="filled" type="button" appOpenSearch i18n>Search stocks</button>
          </app-empty-state>
        } @else if (overview.error() && !stock()) {
          <div class="p-4">
            <app-error-state [error]="overview.error()" (retry)="overview.reload()" />
          </div>
        } @else {
          <section class="px-5 pt-3" aria-label="Price" i18n-aria-label>
            <!-- Back sits here, at the top of the content; the header's left corner holds the menu. T212 users
                 get the bottom pill instead. -->
            @if (!t212.connected()) {
              <div class="mb-2.5 flex items-center">
                <button
                  type="button"
                  class="-ml-2 inline-flex h-8 items-center gap-1 rounded-full pr-3 pl-1.5 text-[13px] font-bold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                  (click)="navigation.back('/followed')"
                >
                  <app-icon name="arrow_back" [size]="18" />
                  <ng-container i18n>Back</ng-container>
                </button>
              </div>
            }
            <!-- The change sits right below, above the chart (it follows the chart's range). -->
            <div class="flex min-w-0 items-center gap-2">
              <app-stock-logo [symbol]="ctx.symbol()" [logoUrl]="stock()?.logoUrl" [size]="24" />
              @if (stock(); as s) {
                <p class="min-w-0 flex-1 truncate text-[17px] font-semibold">{{ s.name }}</p>
              } @else {
                <app-skeleton class="mr-auto h-5 w-40" />
              }
              <app-follow-button class="-mr-2 shrink-0" compact [target]="followTarget()" />
            </div>
            @if (stock(); as s) {
              <app-hero-amount class="mt-1" [value]="s.quote.price" [currency]="s.currency" />
            } @else {
              <app-skeleton class="mt-3 h-12 w-48" />
            }
            <div class="mt-3.5 flex flex-wrap gap-1.5">
              @if (stock(); as s) {
                <span class="app-label rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px]"
                  >{{ s.region }} · {{ s.exchange }}</span
                >
                <span class="app-label rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px]">{{
                  s.currency
                }}</span>
                @if (s.sector || s.industry) {
                  <span class="app-label rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px]"
                    >{{ s.sector }}{{ s.sector && s.industry ? ' · ' : '' }}{{ s.industry }}</span
                  >
                }
              } @else {
                <app-skeleton class="h-6 w-56" />
              }
            </div>
            @if (stock()?.stale) {
              <app-stale-chip class="mt-3 block" [asOf]="stock()!.asOf" />
            }
          </section>

          @defer (on viewport; prefetch on idle) {
            <app-price-chart class="mt-4 block" />
          } @placeholder {
            <div class="mt-4 h-[27rem] sm:h-[29rem] lg:h-[33rem]"></div>
          }

          <app-your-position class="block" />
          <app-key-stats class="mt-4 block" [overview]="stock()" />
          @defer (on viewport; prefetch on idle) {
            <app-performance-history class="mt-4 block" />
          } @placeholder {
            <div class="h-14"></div>
          }
          @defer (on viewport; prefetch on idle) {
            <app-recommendations class="mt-5 block" />
            <app-earnings-stats
              class="mt-4 block"
              [stats]="stock()?.earningsStats"
              [nextEarnings]="stock()?.nextEarnings"
            />
            <app-earnings-history class="mt-2 block" [nextEarnings]="stock()?.nextEarnings" />
            <app-peers class="block" />
            <app-news class="block" />
          } @placeholder {
            <div class="h-14"></div>
          }

          @if (showNotes) {
            @defer (on viewport; prefetch on idle) {
              <app-notes />
            } @placeholder {
              <div class="h-14"></div>
            }
          }
        }
      </div>
      @if (t212.connected()) {
        <app-portfolio-nav tab="search" />
      }
    </app-pull-to-refresh>
  `,
})
export class StockDetailPage {
  /** Personal notes are hidden for now; flip to bring the section back. */
  protected readonly showNotes = false;
  protected readonly ctx = inject(StockContext);
  protected readonly navigation = inject(NavigationService);
  protected readonly menu = inject(MenuService);
  private readonly api = inject(ApiService);
  private readonly recent = inject(RecentSearchesService);
  private readonly title = inject(Title);
  /** Connected T212 users get the portfolio's bottom pill here too (with search active). */
  protected readonly t212 = inject(T212Service);

  /** Route parameter (`/stock/:symbol`). */
  readonly symbol = input.required<string>();

  protected readonly overview = this.ctx.resource((symbol, options) =>
    this.api.overview(symbol, options),
  );
  protected readonly stock = computed(() =>
    this.overview.hasValue() ? this.overview.value() : undefined,
  );
  protected readonly notFound = computed(() => {
    const error = this.overview.error();
    return isApiError(error, 'SYMBOL_NOT_FOUND') || isApiError(error, 'BAD_REQUEST');
  });
  protected readonly followTarget = computed<FollowTarget | null>(() => {
    const s = this.stock();
    return s
      ? {
          symbol: s.symbol,
          name: s.name,
          exchange: s.exchange,
          region: s.region,
          logoUrl: s.logoUrl,
        }
      : null;
  });
  /** The header pill's dot: the day's direction. */
  protected readonly dotClass = computed(() => {
    const change = this.stock()?.quote.change;
    if (change === null || change === undefined || change === 0) return 'bg-on-surface-variant';
    return change > 0 ? 'bg-gain' : 'bg-loss';
  });

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
