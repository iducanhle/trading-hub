import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { Icon } from '../../shared/icon/icon';
import { AppDatePipe, PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { transactionLabel } from './portfolio-labels';
import { PortfolioPeriod, dayIn, displayTicker, periodQuery } from './portfolio-model';

/** Portfolio → Dividends & cash: dividends with their total, then deposits, withdrawals, fees and interest. */
@Component({
  selector: 'app-portfolio-cash',
  imports: [
    RouterLink,
    ErrorState,
    Skeleton,
    StaleChip,
    Icon,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    Pnl,
  ],
  template: `
    <section aria-labelledby="dividends-title">
      <div class="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="dividends-title" class="text-base font-semibold" i18n>Dividends</h2>
        @if (dividends.hasValue()) {
          <p class="text-sm">
            <ng-container i18n>Total</ng-container>
            <app-pnl
              strong
              class="ml-1"
              [value]="dividends.value().total"
              [currency]="dividends.value().accountCurrency"
            />
          </p>
        }
      </div>
      @if (dividends.error() && !dividends.hasValue()) {
        <app-error-state compact [error]="dividends.error()" (retry)="dividends.reload()" />
      } @else if (!dividends.hasValue()) {
        <div class="space-y-2" aria-hidden="true">
          @for (i of [1, 2, 3]; track i) {
            <app-skeleton shape="card" class="h-12" />
          }
        </div>
      } @else {
        @if (dividends.value().stale) {
          <div class="mb-2"><app-stale-chip [asOf]="dividends.value().asOf" /></div>
        }
        @if (dividends.value().items.length === 0) {
          <p class="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant" i18n>
            No dividends in this period.
          </p>
        } @else {
          <ul class="divide-y divide-outline-variant/40">
            @for (d of dividends.value().items; track d.id) {
              <li>
                <a
                  [routerLink]="['/portfolio', d.t212Ticker]"
                  class="flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-container-high"
                >
                  <app-icon name="savings" class="shrink-0 text-on-surface-variant" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{ d.name }}</span>
                    <span class="block truncate text-xs text-on-surface-variant">
                      {{ day(d.paidAt) | appDate }} · {{ ticker(d) }} · {{ d.quantity | qty }}
                      <ng-container i18n>shares</ng-container>
                      @if (d.grossPerShare !== null) {
                        · {{ d.grossPerShare | price: d.grossPerShareCurrency }}
                        <ng-container i18n>per share</ng-container>
                      }
                    </span>
                  </span>
                  <app-pnl [value]="d.amount" [currency]="dividends.value().accountCurrency" />
                </a>
              </li>
            }
          </ul>
        }
      }
    </section>

    <section aria-labelledby="cash-title" class="mt-8">
      <h2 id="cash-title" class="mb-2 text-base font-semibold" i18n>
        Deposits, withdrawals and fees
      </h2>
      @if (transactions.error() && !transactions.hasValue()) {
        <app-error-state compact [error]="transactions.error()" (retry)="transactions.reload()" />
      } @else if (!transactions.hasValue()) {
        <div class="grid grid-cols-2 gap-3" aria-hidden="true">
          @for (i of [1, 2, 3, 4]; track i) {
            <app-skeleton shape="card" class="h-16" />
          }
        </div>
      } @else {
        @let t = transactions.value();
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-3xl bg-surface-container-low p-3">
            <dt class="text-xs text-on-surface-variant" i18n>Deposits</dt>
            <dd class="mt-1 tabular-nums">{{ t.totals.deposits | price: t.accountCurrency }}</dd>
          </div>
          <div class="rounded-3xl bg-surface-container-low p-3">
            <dt class="text-xs text-on-surface-variant" i18n>Withdrawals</dt>
            <dd class="mt-1 tabular-nums">{{ t.totals.withdrawals | price: t.accountCurrency }}</dd>
          </div>
          <div class="rounded-3xl bg-surface-container-low p-3">
            <dt class="text-xs text-on-surface-variant" i18n>Account fees</dt>
            <dd class="mt-1 tabular-nums">{{ t.totals.fees | price: t.accountCurrency }}</dd>
          </div>
          <div class="rounded-3xl bg-surface-container-low p-3">
            <dt class="text-xs text-on-surface-variant" i18n>Interest</dt>
            <dd class="mt-1 tabular-nums">{{ t.totals.interest | price: t.accountCurrency }}</dd>
          </div>
        </dl>
        @if (t.items.length === 0) {
          <p
            class="mt-3 rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant"
            i18n
          >
            No deposits, withdrawals, fees or interest in this period.
          </p>
        } @else {
          <ul class="mt-3 divide-y divide-outline-variant/40">
            @for (x of t.items; track x.id) {
              <li class="flex min-h-12 items-center gap-3 px-2 py-2">
                <app-icon
                  [name]="x.amount < 0 ? 'trending_down' : 'payments'"
                  class="shrink-0 text-on-surface-variant"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{{ label(x.type) }}</span>
                  <span class="block text-xs text-on-surface-variant">{{
                    day(x.at) | appDate
                  }}</span>
                </span>
                <app-pnl [value]="x.amount" [currency]="x.currency" />
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class PortfolioCash {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  readonly period = input.required<PortfolioPeriod>();
  readonly version = input(0);

  private readonly params = computed(() => ({
    query: periodQuery(this.period()),
    version: this.version() + this.t212.dataVersion(),
  }));
  protected readonly dividends = rxResource({
    params: () => this.params(),
    stream: ({ params }) => this.api.t212Dividends(params.query),
  });
  protected readonly transactions = rxResource({
    params: () => this.params(),
    stream: ({ params }) => this.api.t212Transactions(params.query),
  });

  protected day(iso: string): string {
    return dayIn(iso);
  }

  protected label(type: string): string {
    return transactionLabel(type);
  }

  protected ticker(item: { symbol: string | null; t212Ticker: string }): string {
    return displayTicker(item);
  }
}
