import { Location } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, untracked } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { PricePipe } from '../../shared/pipes/format.pipes';
import { EarningsHistory } from './sections/earnings-history';
import { EarningsStats } from './sections/earnings-stats';
import { KeyStats } from './sections/key-stats';
import { News } from './sections/news';
import { Notes } from './sections/notes';
import { Peers } from './sections/peers';
import { PerformanceHistory } from './sections/performance-history';
import { PerformanceSummary } from './sections/performance-summary';
import { YourPosition } from './sections/your-position';
import { PriceChart } from './sections/price-chart/price-chart';
import { Recommendations } from './sections/recommendations';
import { UpcomingEarnings } from './sections/upcoming-earnings';
import { StockContext } from './stock-context';

type StockTab = 'overview' | 'results' | 'analysts' | 'news';

const TABS: { id: StockTab; label: string }[] = [
  { id: 'overview', label: $localize`:Stock page tab:Overview` },
  { id: 'results', label: $localize`:Stock page tab|Earnings results:Results` },
  { id: 'analysts', label: $localize`:Stock page tab:Analysts` },
  { id: 'news', label: $localize`:Stock page tab:News` },
];

/**
 * `/stock/:symbol` (deep-linkable; the digest email links here). Price, chart and then tabs: Overview (upcoming
 * earnings, your position, key stats, performance, peers, notes), Results (performance history, earnings stats and
 * history), Analysts and News. The tab is in the URL (`?tab=results`). The overview response fills the header and
 * the overview tab at once; the other sections load as they are shown, each with its own loading and error state.
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
    HeroAmount,
    FollowButton,
    PullToRefresh,
    Skeleton,
    StaleChip,
    EmptyState,
    ErrorState,
    PricePipe,
    KeyStats,
    PerformanceSummary,
    YourPosition,
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
            aria-label="Back"
            i18n-aria-label
            (click)="navigation.back('/search')"
          >
            <app-icon name="arrow_back" [size]="26" />
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
          @if (!notFound()) {
            <app-follow-button compact [target]="followTarget()" />
          } @else {
            <span class="w-11"></span>
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

      <div class="mx-auto max-w-4xl pb-10">
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
            <a matButton="filled" routerLink="/search" i18n>Search stocks</a>
          </app-empty-state>
        } @else if (overview.error() && !stock()) {
          <div class="p-4">
            <app-error-state [error]="overview.error()" (retry)="overview.reload()" />
          </div>
        } @else {
          <section class="px-5 pt-5" aria-label="Price" i18n-aria-label>
            <!-- The change sits right below, above the chart (it follows the chart's range). -->
            <div class="flex min-w-0 items-center gap-2">
              <app-stock-logo [symbol]="ctx.symbol()" [logoUrl]="stock()?.logoUrl" [size]="24" />
              @if (stock(); as s) {
                <p class="truncate text-[17px] font-semibold">{{ s.name }}</p>
              } @else {
                <app-skeleton class="h-5 w-40" />
              }
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
            <app-price-chart class="mt-3 block" />
          } @placeholder {
            <div class="mt-3 h-[27rem] sm:h-[29rem] lg:h-[33rem]"></div>
          }

          <div
            role="tablist"
            aria-label="Stock sections"
            i18n-aria-label
            class="no-scrollbar sticky top-[calc(4rem+env(safe-area-inset-top))] z-10 mt-3 flex gap-6 overflow-x-auto border-b border-outline-variant bg-surface/90 px-5 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
          >
            @for (t of tabs; track t.id) {
              <button
                type="button"
                role="tab"
                [id]="'stock-tab-' + t.id"
                aria-controls="stock-tab-panel"
                [attr.aria-selected]="activeTab() === t.id"
                [tabIndex]="activeTab() === t.id ? 0 : -1"
                class="shrink-0 border-b-[3px] py-3 text-base font-semibold whitespace-nowrap"
                [class]="
                  activeTab() === t.id
                    ? 'border-on-surface text-on-surface'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                "
                (click)="selectTab(t.id)"
                (keydown)="onTabKey($event)"
              >
                {{ t.label }}
              </button>
            }
          </div>

          <div
            id="stock-tab-panel"
            role="tabpanel"
            class="pt-1"
            [attr.aria-labelledby]="'stock-tab-' + activeTab()"
          >
            @switch (activeTab()) {
              @case ('results') {
                @defer (on viewport; prefetch on idle) {
                  <app-performance-history />
                } @placeholder {
                  <div class="h-14"></div>
                }
                <app-earnings-stats [stats]="stock()?.earningsStats" />
                @defer (on viewport; prefetch on idle) {
                  <app-earnings-history />
                } @placeholder {
                  <div class="h-14"></div>
                }
              }
              @case ('analysts') {
                @defer (on viewport; prefetch on idle) {
                  <app-recommendations />
                } @placeholder {
                  <div class="h-14"></div>
                }
              }
              @case ('news') {
                @defer (on viewport; prefetch on idle) {
                  <app-news />
                } @placeholder {
                  <div class="h-14"></div>
                }
              }
              @default {
                <app-upcoming-earnings [event]="stock()?.nextEarnings" [loading]="!stock()" />
                <app-your-position />
                <app-key-stats [overview]="stock()" />
                <app-performance-summary [performance]="stock()?.performance" />
                @defer (on viewport; prefetch on idle) {
                  <app-peers />
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
            }
          </div>
        }
      </div>
    </app-pull-to-refresh>
  `,
})
export class StockDetailPage {
  /** Personal notes are hidden for now; flip to bring the section back. */
  protected readonly showNotes = false;
  protected readonly ctx = inject(StockContext);
  protected readonly navigation = inject(NavigationService);
  private readonly api = inject(ApiService);
  private readonly recent = inject(RecentSearchesService);
  private readonly title = inject(Title);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  /** Route parameter (`/stock/:symbol`). */
  readonly symbol = input.required<string>();
  /** Query parameter (`?tab=`). */
  readonly tab = input<string>();

  protected readonly tabs = TABS;
  /** Starts from the URL; switching tabs only rewrites the URL (no navigation, so the page title stays). */
  protected readonly activeTab = linkedSignal<StockTab>(
    () => TABS.find((t) => t.id === this.tab())?.id ?? 'overview',
  );

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

  protected selectTab(tab: StockTab): void {
    this.activeTab.set(tab);
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'overview' ? null : tab },
      queryParamsHandling: 'merge',
    });
    this.location.replaceState(url.toString());
  }

  /** Arrow keys, Home and End move between the tabs (and show them). */
  protected onTabKey(event: KeyboardEvent): void {
    const index = TABS.findIndex((t) => t.id === this.activeTab());
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    this.selectTab(TABS[next]!.id);
    document.getElementById('stock-tab-' + TABS[next]!.id)?.focus();
  }

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
