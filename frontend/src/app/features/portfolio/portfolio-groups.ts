import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { T212Group, T212GroupHolding } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import {
  AccountCurrencyPipe,
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { formatPlainPercent, toneClass } from '../../shared/utils/format';
import { askGroupName } from './group-dialogs';
import { Pnl } from './pnl';
import { displayTicker } from './portfolio-model';

/**
 * Portfolio → Groups: the user's own pies. Each group holds the shares of the buys and sells assigned to it, with
 * its own average price, so it shows how much money is in it and what it made. A bar under each group is its share
 * of the portfolio; the shares in no group close the list. All time (no period).
 */
@Component({
  selector: 'app-portfolio-groups',
  imports: [
    AccountCurrencyPipe,
    RouterLink,
    MatButton,
    EmptyState,
    ErrorState,
    HeroAmount,
    Skeleton,
    StaleChip,
    StatList,
    StatRow,
    StockLogo,
    Icon,
    Pnl,
    PercentPipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
  ],
  template: `
    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <div class="space-y-3" aria-hidden="true">
        <app-skeleton shape="card" class="block h-36" />
        <app-skeleton shape="card" class="block h-56" />
      </div>
    } @else {
      @let d = data.value();
      @let currency = d.accountCurrency | acct;
      @if (d.stale) {
        <div class="mb-3"><app-stale-chip [asOf]="d.asOf" /></div>
      }
      @if (d.items.length) {
        <section class="app-card mb-4">
          <p class="app-label" i18n="Total value of all groups of trades">In groups</p>
          <app-hero-amount class="mt-1" [value]="totals().value" [currency]="currency" />
          @if (totals().share !== null) {
            <p class="mt-1 app-row-meta" i18n="Share of the portfolio value held in groups">
              {{ plain(totals().share) }} of the portfolio
            </p>
          }
          <dl appStatList class="mt-3">
            <div
              appStatRow
              total
              label="Profit/loss"
              i18n-label="Realized plus unrealized profit/loss of all groups, before fees"
            >
              <button
                type="button"
                class="-my-1 -mr-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1.5 hover:bg-surface-container-high"
                [attr.aria-expanded]="pnlOpen()"
                (click)="pnlOpen.set(!pnlOpen())"
              >
                <app-pnl [value]="totals().pnl" [currency]="currency" strong />
                <app-icon
                  name="keyboard_arrow_down"
                  [size]="18"
                  class="text-on-surface-variant transition-transform duration-200"
                  [class.rotate-180]="pnlOpen()"
                />
              </button>
            </div>
            @if (pnlOpen()) {
              <div
                appStatRow
                sub
                label="Realized"
                i18n-label="Realized profit/loss of the groups' sells"
              >
                <!-- Lines up with the profit/loss, which has a chevron. -->
                <app-pnl class="pr-3" [value]="totals().realized" [currency]="currency" />
              </div>
              <div
                appStatRow
                sub
                label="Unrealized"
                i18n-label="Unrealized profit or loss of open positions"
              >
                <app-pnl class="pr-3" [value]="totals().unrealized" [currency]="currency" />
              </div>
            }
          </dl>
        </section>
      }

      <div class="mb-3 flex items-center gap-3">
        <h2 class="app-title-section min-w-0 flex-1 truncate">
          <ng-container i18n="Section heading: the user's groups of trades">Groups</ng-container>
          @if (d.items.length) {
            <span class="ml-1 text-[15px] font-semibold text-on-surface-variant">{{
              d.items.length
            }}</span>
          }
        </h2>
        @if (d.items.length) {
          <button matButton="tonal" type="button" [disabled]="creating()" (click)="create()">
            <app-icon matButtonIcon name="add" [size]="18" />
            <ng-container i18n="Button that creates a group of trades">New group</ng-container>
          </button>
        }
      </div>

      @if (!d.items.length) {
        <app-empty-state
          icon="folder"
          title="No groups yet"
          i18n-title
          text="A group works like a pie: add buys and sells to it and see how much money is in it and what it made, at its own average price."
          i18n-text
        >
          <button matButton="filled" type="button" [disabled]="creating()" (click)="create()">
            <app-icon matButtonIcon name="add" [size]="18" />
            <ng-container i18n="Button that creates a group of trades">New group</ng-container>
          </button>
        </app-empty-state>
      } @else {
        <ul class="app-card py-1.5">
          @for (g of d.items; track g.id) {
            <li>
              <a
                [routerLink]="['/portfolio/groups', g.id]"
                class="-mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-3 hover:bg-surface-container-high"
              >
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary"
                >
                  <app-icon name="folder" />
                </span>
                <!-- Two full-width lines, so the meta and the realized amount share the whole row. -->
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-3">
                    <span class="min-w-0 flex-1 truncate app-row-title">{{ g.name }}</span>
                    <span class="shrink-0 text-[14px] font-semibold">{{
                      g.value | price: currency
                    }}</span>
                  </span>
                  <span class="mt-0.5 flex items-baseline gap-3">
                    <span class="min-w-0 flex-1 truncate app-row-meta">
                      <ng-container i18n>{g.holdings.length, plural,
                        =0 {no holdings}
                        =1 {1 holding}
                        other {{{g.holdings.length}} holdings}
                      }</ng-container>
                    </span>
                    @let pnl = groupPnl(g);
                    <span class="shrink-0 text-[13px] font-medium" [class]="tone(pnl)">
                      <ng-container
                        i18n="Realized + unrealized P/L of a group; AMOUNT is signed, like +12.30 €"
                        >P/L {{ pnl | money: currency }}</ng-container
                      >
                    </span>
                  </span>
                  <span class="mt-2 flex items-center gap-2.5">
                    <span
                      class="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
                      aria-hidden="true"
                    >
                      <span
                        class="block h-full rounded-full bg-primary"
                        [style.width.%]="weight(g.value) ?? 0"
                      ></span>
                    </span>
                    <span class="shrink-0 text-[12px] font-semibold text-on-surface-variant">{{
                      plain(weight(g.value))
                    }}</span>
                  </span>
                </span>
              </a>
            </li>
          }
          @if (d.ungrouped.holdings.length) {
            <li>
              <button
                type="button"
                class="-mx-2 flex w-[calc(100%+16px)] items-center gap-3.5 rounded-2xl px-2 py-3 text-left hover:bg-surface-container-high"
                [attr.aria-expanded]="ungroupedOpen()"
                aria-controls="ungrouped-holdings"
                (click)="ungroupedOpen.set(!ungroupedOpen())"
              >
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant"
                >
                  <app-icon name="block" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-3">
                    <span
                      class="min-w-0 flex-1 truncate app-row-title"
                      i18n="Shares held in no group"
                      >Not in a group</span
                    >
                    <span class="shrink-0 text-[14px] font-semibold">{{
                      d.ungrouped.value | price: currency
                    }}</span>
                  </span>
                  <span class="mt-0.5 flex items-center gap-1 app-row-meta whitespace-nowrap">
                    <ng-container i18n>{d.ungrouped.holdings.length, plural,
                      =1 {1 holding}
                      other {{{d.ungrouped.holdings.length}} holdings}
                    }</ng-container>
                    <app-icon
                      name="keyboard_arrow_down"
                      [size]="16"
                      [strokeWidth]="2.2"
                      class="transition-transform"
                      [class.rotate-180]="ungroupedOpen()"
                    />
                  </span>
                  <span class="mt-2 flex items-center gap-2.5">
                    <span
                      class="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-container-highest"
                      aria-hidden="true"
                    >
                      <span
                        class="block h-full rounded-full bg-on-surface-variant"
                        [style.width.%]="weight(d.ungrouped.value) ?? 0"
                      ></span>
                    </span>
                    <span class="shrink-0 text-[12px] font-semibold text-on-surface-variant">{{
                      plain(weight(d.ungrouped.value))
                    }}</span>
                  </span>
                </span>
              </button>
              @if (ungroupedOpen()) {
                <ul id="ungrouped-holdings" class="ml-5 pl-2">
                  @for (h of d.ungrouped.holdings; track h.t212Ticker) {
                    <li>
                      <a
                        [routerLink]="['/portfolio', h.t212Ticker]"
                        class="-mx-2 flex items-center gap-3.5 rounded-2xl px-2 py-3 hover:bg-surface-container-high"
                      >
                        <app-stock-logo [symbol]="ticker(h)" [logoUrl]="h.logoUrl" [size]="36" />
                        <span class="min-w-0 flex-1">
                          <span class="block truncate app-row-title">{{ h.name }}</span>
                          <span class="mt-0.5 block truncate app-row-meta uppercase"
                            >{{ h.quantity | qty }} {{ ticker(h) }}</span
                          >
                        </span>
                        <span class="flex shrink-0 flex-col items-end text-right">
                          <span class="text-[14px] font-semibold">{{
                            h.value | price: currency
                          }}</span>
                          <span
                            class="mt-0.5 text-[13px] font-medium"
                            [class]="tone(h.unrealizedPnl)"
                            >{{ h.unrealizedPnl | money: currency }} ({{
                              h.unrealizedPnlPct | pct
                            }})</span
                          >
                        </span>
                      </a>
                    </li>
                  }
                </ul>
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class PortfolioGroups {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);

  protected readonly creating = signal(false);
  protected readonly ungroupedOpen = signal(false);
  /** Shows the realized and unrealized parts under the profit/loss. */
  protected readonly pnlOpen = signal(false);

  protected readonly data = rxResource({
    params: () => ({ version: this.version() + this.t212.dataVersion() }),
    stream: ({ params }) => this.api.t212Groups({ force: params.version > 0 }),
  });

  /** Sums over the groups, and their share of the groups plus the shares in no group. */
  protected readonly totals = computed(() => {
    const d = this.data.value();
    if (!d) return { value: null, share: null, realized: null, unrealized: null, pnl: null };
    const known = (values: (number | null)[]) =>
      values.some((v) => v === null) ? null : values.reduce<number>((s, v) => s + (v ?? 0), 0);
    const value = known(d.items.map((g) => g.value));
    const total = this.portfolioValue();
    const realized = d.items.reduce((s, g) => s + g.realizedPnl, 0);
    const unrealized = known(d.items.map((g) => g.unrealizedPnl));
    return {
      value,
      share: value !== null && total ? (value / total) * 100 : null,
      realized,
      unrealized,
      pnl: unrealized === null ? null : realized + unrealized,
    };
  });

  private readonly portfolioValue = computed(() => {
    const d = this.data.value();
    if (!d || d.ungrouped.value === null || d.items.some((g) => g.value === null)) return null;
    return d.items.reduce((s, g) => s + (g.value ?? 0), d.ungrouped.value);
  });

  constructor() {
    // Values change with prices: refetch quietly on every live tick, keep showing the old value on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        this.t212.trackLive(firstValueFrom(this.api.t212Groups({ force: true }))).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }

  /** Share of the portfolio's value in percent; null when unknown. */
  protected weight(value: number | null): number | null {
    const total = this.portfolioValue();
    return value === null || !total ? null : (value / total) * 100;
  }

  protected async create(): Promise<void> {
    const name = await askGroupName(this.dialog);
    if (!name) return;
    this.creating.set(true);
    try {
      const group = await firstValueFrom(this.api.t212CreateGroup(name));
      void this.router.navigate(['/portfolio/groups', group.id]);
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    } finally {
      this.creating.set(false);
    }
  }

  /** Realized plus unrealized, before fees; null while the unrealized part is unknown. */
  protected groupPnl(g: T212Group): number | null {
    return g.unrealizedPnl === null ? null : g.realizedPnl + g.unrealizedPnl;
  }

  protected plain(value: number | null): string {
    return formatPlainPercent(value, 0);
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected ticker(h: T212GroupHolding): string {
    return displayTicker(h);
  }
}
