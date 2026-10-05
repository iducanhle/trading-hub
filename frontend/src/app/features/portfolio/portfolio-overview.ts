import { Component, effect, inject, input, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { Icon } from '../../shared/icon/icon';
import { PortfolioAllocation } from './portfolio-allocation';
import { PortfolioHoldings } from './portfolio-holdings';
import { PortfolioHistory } from './portfolio-history';
import { PortfolioPeriod, periodQuery } from './portfolio-model';

const ALL_TIME: PortfolioPeriod = { preset: 'ALL', from: null, to: null };

/** Portfolio → Overview: account value, all-time and unrealized profit/loss, open positions. */
@Component({
  selector: 'app-portfolio-overview',
  imports: [
    ErrorState,
    Skeleton,
    StaleChip,
    Icon,
    PortfolioHoldings,
    PortfolioAllocation,
    PortfolioHistory,
  ],
  template: `
    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <app-skeleton shape="card" class="block h-32" aria-hidden="true" />
    } @else {
      @let s = data.value();
      @if (s.stale) {
        <div class="mb-3"><app-stale-chip [asOf]="s.asOf" /></div>
      }
      @if (t212.syncing() && !s.lastSyncAt) {
        <p
          class="mb-3 flex items-center gap-2 rounded-2xl bg-secondary-container p-3 text-sm text-on-secondary-container"
          role="status"
        >
          <app-icon name="sync" [size]="18" class="animate-spin" />
          <ng-container i18n
            >The first sync is running. Your history appears here as it arrives.</ng-container
          >
        </p>
      }

      @if (!s.best && !t212.syncing()) {
        <p class="mt-6 text-center text-sm text-on-surface-variant" i18n>
          No trades or dividends yet.
        </p>
      }

      <app-portfolio-history class="mt-3.5 block" [version]="version()" />

      <app-portfolio-allocation class="mt-3.5 block" [version]="version()" />

      <app-portfolio-holdings
        class="mt-3.5 block"
        [version]="version()"
        [accountValue]="s.totalValue"
        [cash]="s.cash"
        [unrealizedPnl]="s.unrealizedPnl"
        [currency]="s.accountCurrency"
      />
    }
  `,
})
export class PortfolioOverview {
  private readonly api = inject(ApiService);
  protected readonly t212 = inject(T212Service);

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);

  protected readonly data = rxResource({
    params: () => ({
      query: periodQuery(ALL_TIME),
      version: this.version() + this.t212.dataVersion(),
    }),
    stream: ({ params }) => this.api.t212Summary(params.query),
  });

  constructor() {
    // Account value changes with prices: refetch quietly every minute, keep showing the old value on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        this.t212.trackLive(firstValueFrom(this.api.t212Summary(periodQuery(ALL_TIME), { force: true }))).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }
}
