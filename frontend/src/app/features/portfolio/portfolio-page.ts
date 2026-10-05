import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api/api-error';
import { T212Side } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PullToRefresh } from '../../shared/components/pull-to-refresh/pull-to-refresh';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { OpenSearch } from '../../shared/directives/open-search';
import { Icon } from '../../shared/icon/icon';
import { PeriodSelector } from './period-selector';
import { PortfolioCash } from './portfolio-cash';
import { PortfolioNav } from './portfolio-nav';
import {
  PORTFOLIO_TABS,
  PortfolioPeriod,
  PortfolioTab,
  parsePeriod,
  periodParams,
} from './portfolio-model';
import { PortfolioOverview } from './portfolio-overview';
import { PortfolioStocks } from './portfolio-stocks';
import { PortfolioTrades } from './portfolio-trades';
import { TradeFilters } from './trades-filters';

/**
 * `/portfolio`: the user's Trading 212 account. Sub-tabs Overview · Stocks · Trades · Dividends & cash (a floating
 * pill at the bottom, `app-portfolio-nav`) share one period; both live in the URL (`?tab=trades&period=3M`), as do the trade filters (`side`, `ticker`). Pulling
 * down starts a sync; live values refetch every minute, with the same indicator. Without a connection it explains the feature and links to Settings.
 */
@Component({
  selector: 'app-portfolio-page',
  imports: [
    OpenSearch,
    RouterLink,
    MatButton,
    MatIconButton,
    EmptyState,
    ErrorState,
    PageHeader,
    PullToRefresh,
    Skeleton,
    Icon,
    PeriodSelector,
    PortfolioNav,
    PortfolioOverview,
    PortfolioStocks,
    PortfolioTrades,
    PortfolioCash,
  ],
  template: `
    <app-pull-to-refresh [refreshing]="refreshing()" (refresh)="sync()">
      <app-page-header title="Portfolio" i18n-title maxWidth="max-w-3xl">
        @if (t212.connected()) {
          <!-- Search lives in the bottom pill here. -->
          <button
            actions
            matIconButton
            type="button"
            [attr.aria-label]="t212.syncing() ? labels.syncing : labels.sync"
            [disabled]="t212.syncing() || t212.status()?.credentialsValid === false"
            (click)="sync()"
          >
            <app-icon name="refresh" [class.animate-spin]="refreshing()" />
          </button>
        } @else {
          <button actions matIconButton type="button" appOpenSearch aria-label="Search" i18n-aria-label>
            <app-icon name="search" />
          </button>
        }
      </app-page-header>

      <div class="mx-auto max-w-3xl px-3 pt-2" [class]="t212.connected() ? 'pb-36' : 'pb-10'">
        @if (!t212.loaded()) {
          <div class="space-y-3" aria-hidden="true">
            <app-skeleton shape="card" class="h-32" />
            <app-skeleton shape="card" class="h-20" />
          </div>
        } @else if (t212.notConfigured()) {
          <app-empty-state
            icon="account_balance_wallet"
            title="Portfolio isn't available yet"
            i18n-title
            text="This server is not set up for Trading 212 yet."
            i18n-text
          />
        } @else if (t212.error()) {
          <app-error-state [error]="t212.error()" (retry)="t212.load(true)" />
        } @else if (!t212.connected()) {
          <app-empty-state
            icon="account_balance_wallet"
            title="Your Trading 212 portfolio"
            i18n-title
            text="Connect your Trading 212 account to see every trade, filter them, and how much you made or lost on each stock and overall, for any period. The app only reads your account."
            i18n-text
          >
            <a matButton="filled" routerLink="/settings" fragment="trading212">
              <app-icon matButtonIcon name="account_balance_wallet" [size]="18" />
              <ng-container i18n>Connect Trading 212</ng-container>
            </a>
          </app-empty-state>
        } @else {
          @if (tab() === 'overview') {
            <p
              class="mb-3 text-center text-xs text-on-surface-variant"
              i18n="Portfolio page|Note under the header: live values refetch automatically"
            >
              Data are refreshed every minute.
            </p>
          }
          @if (t212.status()?.credentialsValid === false) {
            <a
              routerLink="/settings"
              fragment="trading212"
              class="mb-4 flex items-center gap-3 rounded-2xl bg-error-container p-3 text-sm text-on-error-container"
            >
              <app-icon name="warning" [size]="20" class="shrink-0" />
              <span class="flex-1" i18n
                >Trading 212 no longer accepts the stored key, so this data isn't updated. Replace
                the key in Settings.</span
              >
              <app-icon name="chevron_right" [size]="20" />
            </a>
          }
          @if (tab() !== 'overview') {
            <app-period-selector
              class="mb-4 block"
              [period]="period()"
              (periodChange)="setPeriod($event)"
            />
          }
          @switch (tab()) {
            @case ('stocks') {
              <app-portfolio-stocks [period]="period()" [version]="version()" />
            }
            @case ('trades') {
              <app-portfolio-trades
                [period]="period()"
                [version]="version()"
                [filters]="tradeFilters()"
                (filtersChange)="setTradeFilters($event)"
              />
            }
            @case ('cash') {
              <app-portfolio-cash [period]="period()" [version]="version()" />
            }
            @default {
              <app-portfolio-overview [version]="version()" />
            }
          }
        }
      </div>
      @if (t212.connected()) {
        <app-portfolio-nav [tab]="tab()" />
      }
    </app-pull-to-refresh>
  `,
})
export class PortfolioPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);
  protected readonly t212 = inject(T212Service);

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly version = signal(0);
  /** A sync or the quiet once-a-minute refetch is running: both show the pull-to-refresh indicator. */
  protected readonly refreshing = computed(() => this.t212.syncing() || this.t212.liveRefreshing());

  protected readonly tab = computed<PortfolioTab>(() => {
    const value = this.query().get('tab') as PortfolioTab | null;
    return value && PORTFOLIO_TABS.includes(value) ? value : 'overview';
  });
  protected readonly period = computed(() =>
    parsePeriod({
      period: this.query().get('period'),
      from: this.query().get('from'),
      to: this.query().get('to'),
    }),
  );
  protected readonly tradeFilters = computed<TradeFilters>(() => {
    const side = this.query().get('side');
    return {
      side: side === 'BUY' || side === 'SELL' ? (side as T212Side) : null,
      tickers: (this.query().get('ticker') ?? '').split(',').filter(Boolean),
    };
  });

  protected readonly labels = {
    sync: $localize`Sync with Trading 212`,
    syncing: $localize`Syncing with Trading 212`,
  };

  constructor() {
    void this.t212.syncIfStale();
    inject(DestroyRef).onDestroy(this.t212.watchLive());
  }

  protected setPeriod(period: PortfolioPeriod): void {
    this.navigate(periodParams(period));
  }

  protected setTradeFilters(filters: TradeFilters): void {
    this.navigate({ side: filters.side, ticker: filters.tickers.join(',') || null });
  }

  /** Starts a sync; the lists refresh when it finishes (T212Service.dataVersion). */
  protected async sync(): Promise<void> {
    if (!this.t212.connected() || this.t212.syncing()) return;
    try {
      await this.t212.sync();
      this.version.update((v) => v + 1);
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    }
  }

  private navigate(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
