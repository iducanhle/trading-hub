import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { T212InstrumentRef } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { PercentPipe, PricePipe, SignedMoneyPipe } from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { PortfolioAllocation } from './portfolio-allocation';
import { PortfolioHoldings } from './portfolio-holdings';
import { PortfolioPeriod, displayTicker, periodQuery } from './portfolio-model';

const ALL_TIME: PortfolioPeriod = { preset: 'ALL', from: null, to: null };

/** Portfolio → Overview: account value, all-time profit/loss, best and worst stocks, open positions. */
@Component({
  selector: 'app-portfolio-overview',
  imports: [
    RouterLink,
    ErrorState,
    Skeleton,
    StaleChip,
    StockLogo,
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
        <p
          class="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3.5 py-2 text-[12.5px] font-semibold"
        >
          <span class="size-[9px] rounded-full bg-on-surface-variant" aria-hidden="true"></span>
          {{ s.netDeposits | price: s.accountCurrency }}
          <span class="app-label text-[11.5px]" i18n>net deposits</span>
        </p>
      </section>

      @if (extremes().length) {
        <section
          class="app-card mt-5 grid grid-cols-2 gap-3.5"
          aria-label="Best and worst"
          i18n-aria-label
        >
          @for (row of extremes(); track row.label; let second = $odd) {
            <a
              [routerLink]="['/portfolio', row.item.t212Ticker]"
              class="flex min-w-0 flex-col gap-2"
              [class]="second ? 'border-l border-outline-variant pl-3.5' : ''"
            >
              <span class="app-label">{{ row.label }}</span>
              <span class="flex min-w-0 items-center gap-2.5">
                <app-stock-logo
                  [symbol]="ticker(row.item)"
                  [logoUrl]="row.item.logoUrl"
                  [size]="36"
                />
                <span class="line-clamp-2 min-w-0 text-sm leading-tight font-medium">{{
                  row.item.name
                }}</span>
              </span>
              <span class="text-[15px] font-semibold" [class]="tone(row.item.totalPnl)">{{
                row.item.totalPnl | money: s.accountCurrency
              }}</span>
            </a>
          }
        </section>
      } @else if (!t212.syncing()) {
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

  protected readonly extremes = computed(() => {
    if (!this.data.hasValue()) return [];
    const { best, worst } = this.data.value();
    const rows: { label: string; item: T212InstrumentRef }[] = [];
    if (best) rows.push({ label: $localize`Best`, item: best });
    if (worst) rows.push({ label: $localize`Worst`, item: worst });
    return rows;
  });

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected ticker(item: T212InstrumentRef): string {
    return displayTicker(item);
  }
}
