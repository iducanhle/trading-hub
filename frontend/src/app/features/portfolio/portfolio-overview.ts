import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { T212InstrumentRef } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { TermInfo } from '../../shared/components/term-info/term-info';
import { Icon } from '../../shared/icon/icon';
import { DateTimePipe, PricePipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { PortfolioPeriod, displayTicker, isAllTime, periodQuery } from './portfolio-model';

/** Portfolio → Overview: account value, profit/loss of the period, best and worst stocks. */
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
    DateTimePipe,
    Pnl,
  ],
  template: `
    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <app-skeleton shape="card" class="h-20" />
        }
      </div>
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

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div
          class="col-span-2 rounded-3xl bg-primary-container p-4 text-on-primary-container sm:col-span-3"
        >
          <p class="text-xs" i18n>Total value · as of now</p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">
            {{ s.totalValue | price: s.accountCurrency }}
          </p>
          <p class="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span class="inline-flex items-center gap-1">
              @if (s.includesUnrealized) {
                <ng-container i18n>Total profit/loss</ng-container>
              } @else {
                <ng-container i18n>Profit/loss in this period</ng-container>
              }
              <app-term-info term="totalPnl" />
            </span>
            <app-pnl
              strong
              class="bg-surface/80 rounded-full px-2"
              [value]="s.totalPnl"
              [currency]="s.accountCurrency"
              [pct]="allTime() ? s.totalPnlPct : undefined"
            />
          </p>
          @if (!s.includesUnrealized) {
            <p class="mt-1 text-xs opacity-80" i18n>
              Realized profit/loss, dividends and fees of the period; unrealized profit/loss is not
              included.
            </p>
          }
        </div>

        <div class="rounded-3xl bg-surface-container-low p-3">
          <p class="flex items-center gap-1 text-xs text-on-surface-variant">
            <ng-container i18n>Realized</ng-container><app-term-info term="realizedPnl" />
          </p>
          <app-pnl class="mt-1 text-lg" [value]="s.realizedPnl" [currency]="s.accountCurrency" />
        </div>
        @if (allTime()) {
          <div class="rounded-3xl bg-surface-container-low p-3">
            <p class="flex items-center gap-1 text-xs text-on-surface-variant">
              <ng-container i18n>Unrealized · as of now</ng-container
              ><app-term-info term="unrealizedPnl" />
            </p>
            <app-pnl
              class="mt-1 text-lg"
              [value]="s.unrealizedPnl"
              [currency]="s.accountCurrency"
            />
          </div>
        }
        <div class="rounded-3xl bg-surface-container-low p-3">
          <p class="text-xs text-on-surface-variant" i18n>Dividends</p>
          <app-pnl class="mt-1 text-lg" [value]="s.dividends" [currency]="s.accountCurrency" />
        </div>
        <div class="rounded-3xl bg-surface-container-low p-3">
          <p class="text-xs text-on-surface-variant" i18n>Fees and taxes</p>
          <app-pnl class="mt-1 text-lg" [value]="-s.fees" [currency]="s.accountCurrency" />
        </div>
        <div class="rounded-3xl bg-surface-container-low p-3">
          <p class="text-xs text-on-surface-variant" i18n>Net deposits</p>
          <p class="mt-1 text-lg tabular-nums">{{ s.netDeposits | price: s.accountCurrency }}</p>
        </div>
        <div class="rounded-3xl bg-surface-container-low p-3">
          <p class="text-xs text-on-surface-variant" i18n>Cash · as of now</p>
          <p class="mt-1 text-lg tabular-nums">{{ s.cash | price: s.accountCurrency }}</p>
        </div>
      </div>

      @if (extremes().length) {
        <h2 class="mt-6 mb-2 text-sm font-semibold text-on-surface-variant" i18n>
          Best and worst in this period
        </h2>
        <ul class="space-y-1">
          @for (row of extremes(); track row.label) {
            <li>
              <a
                [routerLink]="['/portfolio', row.item.t212Ticker]"
                class="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-container-high"
              >
                <app-stock-logo
                  [symbol]="ticker(row.item)"
                  [logoUrl]="row.item.logoUrl"
                  [size]="36"
                />
                <span class="min-w-0 flex-1">
                  <span class="block text-xs text-on-surface-variant">{{ row.label }}</span>
                  <span class="block truncate font-medium">{{ row.item.name }}</span>
                </span>
                <app-pnl strong [value]="row.item.totalPnl" [currency]="s.accountCurrency" />
              </a>
            </li>
          }
        </ul>
      } @else if (!t212.syncing()) {
        <p class="mt-6 text-center text-sm text-on-surface-variant" i18n>
          No trades or dividends in this period.
        </p>
      }

      <p class="mt-6 text-center text-xs text-on-surface-variant">
        @if (t212.syncing()) {
          <ng-container i18n>Syncing with Trading 212…</ng-container>
        } @else if (s.lastSyncAt) {
          <ng-container i18n>Synced with Trading 212 · {{ s.lastSyncAt | dateTime }}</ng-container>
        }
        ·
        <ng-container i18n>{s.tradeCount, plural,
          =1 {1 trade in this period}
          other {{{ s.tradeCount }} trades in this period}
        }</ng-container>
      </p>
    }
  `,
})
export class PortfolioOverview {
  private readonly api = inject(ApiService);
  protected readonly t212 = inject(T212Service);

  readonly period = input.required<PortfolioPeriod>();
  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);

  protected readonly allTime = computed(() => isAllTime(this.period()));
  protected readonly data = rxResource({
    params: () => ({
      query: periodQuery(this.period()),
      version: this.version() + this.t212.dataVersion(),
    }),
    stream: ({ params }) => this.api.t212Summary(params.query),
  });

  protected readonly extremes = computed(() => {
    if (!this.data.hasValue()) return [];
    const { best, worst } = this.data.value();
    const rows: { label: string; item: T212InstrumentRef }[] = [];
    if (best) rows.push({ label: $localize`Best`, item: best });
    if (worst) rows.push({ label: $localize`Worst`, item: worst });
    return rows;
  });

  protected ticker(item: T212InstrumentRef): string {
    return displayTicker(item);
  }
}
