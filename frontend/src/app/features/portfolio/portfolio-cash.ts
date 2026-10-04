import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api/api.service';
import { T212Dividend } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { Icon } from '../../shared/icon/icon';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import {
  AppDatePipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { transactionLabel } from './portfolio-labels';
import { PortfolioPeriod, dayIn, displayTicker, periodQuery } from './portfolio-model';
import { DividendDialog, DividendDialogData } from './dividend-dialog';
import { DIALOG_CONFIG } from '../../shared/components/dialog/dialog';

/** Portfolio → Dividends & cash: dividends with their total, or (switch) deposits, withdrawals, fees and interest. */
@Component({
  selector: 'app-portfolio-cash',
  imports: [
    StatList,
    StatRow,
    ErrorState,
    Skeleton,
    StaleChip,
    Icon,
    AppDatePipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
    HeroAmount,
    Segmented,
    Segment,
  ],
  template: `
    <app-segmented
      stretch
      aria-label="Dividends or cash"
      i18n-aria-label
      [value]="view()"
      (valueChange)="view.set($event)"
    >
      <app-segment value="dividends" i18n>Dividends</app-segment>
      <app-segment value="cash" i18n="Deposits, withdrawals, fees and interest">Cash</app-segment>
    </app-segmented>

    @if (view() === 'dividends') {
      <section aria-labelledby="dividends-title" class="mt-5">
        <h2 id="dividends-title" class="app-label px-1" i18n>Total dividends</h2>
        @if (dividends.error() && !dividends.hasValue()) {
          <app-error-state
            class="mt-3 block"
            compact
            [error]="dividends.error()"
            (retry)="dividends.reload()"
          />
        } @else if (!dividends.hasValue()) {
          <div class="mt-2 space-y-3" aria-hidden="true">
            <app-skeleton class="block h-12 w-48" />
            <app-skeleton shape="card" class="block h-48 rounded-[22px]" />
          </div>
        } @else {
          @let d = dividends.value();
          <app-hero-amount
            class="mt-1 px-1"
            size="md"
            signed
            [value]="d.total"
            [currency]="d.accountCurrency"
          />
          @if (d.stale) {
            <div class="mt-3"><app-stale-chip [asOf]="d.asOf" /></div>
          }
          @if (d.items.length === 0) {
            <p class="app-card mt-3.5 text-sm text-on-surface-variant" i18n>
              No dividends in this period.
            </p>
          } @else {
            <ul class="app-card mt-3.5 py-2">
              @for (x of d.items; track x.id) {
                <li>
                  <button
                    type="button"
                    (click)="openDividend(x, d.accountCurrency)"
                    class="w-[calc(100%+1rem)] text-left -mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-2.5 hover:bg-surface-container-high"
                  >
                    <span
                      class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-gain"
                      aria-hidden="true"
                    >
                      <app-icon name="savings" [size]="20" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate app-row-title">{{ x.name }}</span>
                      <span class="mt-0.5 block truncate app-row-meta">
                        {{ day(x.paidAt) | appDate }} · {{ ticker(x) }} · {{ x.quantity | qty }}
                        <ng-container i18n>shares</ng-container>
                        @if (x.grossPerShare !== null) {
                          · {{ x.grossPerShare | price: x.grossPerShareCurrency }}
                          <ng-container i18n>per share</ng-container>
                        }
                      </span>
                    </span>
                    <span class="shrink-0 text-[15px] font-semibold" [class]="tone(x.amount)">{{
                      x.amount | money: d.accountCurrency
                    }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        }
      </section>
    } @else {
      <section aria-labelledby="cash-title" class="mt-5">
        <h2 id="cash-title" class="sr-only" i18n>Deposits, withdrawals and fees</h2>
        @if (transactions.error() && !transactions.hasValue()) {
          <app-error-state compact [error]="transactions.error()" (retry)="transactions.reload()" />
        } @else if (!transactions.hasValue()) {
          <app-skeleton shape="card" class="block h-44 rounded-[22px]" aria-hidden="true" />
        } @else {
          @let t = transactions.value();
          <dl appStatList card>
            <div appStatRow label="Deposits" i18n-label>
              {{ t.totals.deposits | price: t.accountCurrency }}
            </div>
            <div appStatRow label="Withdrawals" i18n-label>
              {{ t.totals.withdrawals | price: t.accountCurrency }}
            </div>
            <div appStatRow label="Account fees" i18n-label>
              {{ t.totals.fees | price: t.accountCurrency }}
            </div>
            <div appStatRow label="Interest" i18n-label>
              {{ t.totals.interest | price: t.accountCurrency }}
            </div>
          </dl>
          @if (t.items.length === 0) {
            <p class="app-card mt-3.5 text-sm text-on-surface-variant" i18n>
              No deposits, withdrawals, fees or interest in this period.
            </p>
          } @else {
            <ul class="app-card mt-3.5 py-2">
              @for (x of t.items; track x.id) {
                <li class="flex items-center gap-3.5 py-2.5">
                  <span
                    class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high"
                    aria-hidden="true"
                  >
                    <app-icon [name]="x.amount < 0 ? 'trending_down' : 'payments'" [size]="20" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate app-row-title">{{ label(x.type) }}</span>
                    <span class="mt-0.5 block app-row-meta">{{ day(x.at) | appDate }}</span>
                  </span>
                  <span class="shrink-0 text-[15px] font-semibold" [class]="tone(x.amount)">{{
                    x.amount | money: x.currency
                  }}</span>
                </li>
              }
            </ul>
          }
        }
      </section>
    }
  `,
})
export class PortfolioCash {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);

  readonly period = input.required<PortfolioPeriod>();
  readonly version = input(0);

  protected readonly view = persistedSignal<'dividends' | 'cash'>(
    'portfolio.cash.view',
    'dividends',
  );

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

  protected openDividend(dividend: T212Dividend, currency: string | null): void {
    this.dialog.open<DividendDialog, DividendDialogData>(DividendDialog, {
      data: { dividend, currency },
      ...DIALOG_CONFIG,
    });
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

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
