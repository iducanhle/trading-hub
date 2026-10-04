import { Component, effect, inject, input, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { PercentPipe, PricePipe, SignedMoneyPipe } from '../../shared/pipes/format.pipes';
import { toneClass, toneOf } from '../../shared/utils/format';
import { PortfolioAllocation } from './portfolio-allocation';
import { PortfolioHoldings } from './portfolio-holdings';
import { PortfolioPeriod, periodQuery } from './portfolio-model';

const ALL_TIME: PortfolioPeriod = { preset: 'ALL', from: null, to: null };

/** Portfolio → Overview: account value, all-time and unrealized profit/loss, open positions. */
@Component({
  selector: 'app-portfolio-overview',
  imports: [
    ErrorState,
    Skeleton,
    StaleChip,
    TermInfo,
    Icon,
    PricePipe,
    PercentPipe,
    SignedMoneyPipe,
    HeroAmount,
    PortfolioHoldings,
    PortfolioAllocation,
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

      <section aria-labelledby="account-value">
        <p id="account-value" class="app-label" i18n>Account value</p>
        <app-hero-amount class="mt-1" [value]="s.totalValue" [currency]="s.accountCurrency" />
        <div class="mt-3.5 flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <p class="app-label inline-flex items-center gap-1">
              <ng-container i18n>Total profit/loss</ng-container>
              <app-term-info term="totalPnl" />
            </p>
            <p class="mt-0.5 text-[15px] font-semibold" [class]="tone(s.totalPnl)">
              {{ s.totalPnl | money: s.accountCurrency }}
            </p>
          </div>
          @if (s.rateOfReturnPct !== null) {
            <div>
              <p class="app-label" i18n="Money-weighted return, as Trading 212 shows it">
                Rate of return
              </p>
              <p class="mt-0.5 text-[15px] font-semibold" [class]="tone(s.rateOfReturnPct)">
                {{ s.rateOfReturnPct | pct: 1 }}
              </p>
            </div>
          }
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <p
            class="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3.5 py-2 text-[12.5px] font-semibold"
          >
            <span class="size-[9px] rounded-full bg-on-surface-variant" aria-hidden="true"></span>
            {{ s.netDeposits | price: s.accountCurrency }}
            <span class="app-label text-[11.5px]" i18n>net deposits</span>
          </p>
          <p
            class="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-semibold"
            [class]="unrealizedPill(s.unrealizedPnl)"
          >
            <span
              class="size-[9px] rounded-full"
              [class]="unrealizedDot(s.unrealizedPnl)"
              aria-hidden="true"
            ></span>
            {{ s.unrealizedPnl | money: s.accountCurrency }}
            <span class="app-label text-[11.5px]" i18n>unrealized profit</span>
          </p>
        </div>
      </section>

      @if (!s.best && !t212.syncing()) {
        <p class="mt-6 text-center text-sm text-on-surface-variant" i18n>
          No trades or dividends yet.
        </p>
      }

      <app-portfolio-allocation class="mt-3.5 block" [version]="version()" />

      <app-portfolio-holdings
        class="mt-3.5 block"
        [version]="version()"
        [total]="s.currentValue"
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
        firstValueFrom(this.api.t212Summary(periodQuery(ALL_TIME), { force: true })).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** Same pill as net deposits, tinted by the sign: green for a gain, red for a loss, grey at zero. */
  protected unrealizedPill(value: number | null): string {
    switch (toneOf(value)) {
      case 'gain':
        return 'bg-gain-container text-gain';
      case 'loss':
        return 'bg-loss-container text-loss';
      default:
        return 'bg-surface-container-high';
    }
  }

  protected unrealizedDot(value: number | null): string {
    switch (toneOf(value)) {
      case 'gain':
        return 'bg-gain';
      case 'loss':
        return 'bg-loss';
      default:
        return 'bg-on-surface-variant';
    }
  }
}
