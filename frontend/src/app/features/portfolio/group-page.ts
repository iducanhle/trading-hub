import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage, isApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
import { T212GroupHolding, T212GroupTrade } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { T212Service } from '../../core/services/t212.service';
import { confirmInDialog } from '../../shared/components/confirm-sheet/confirm-sheet';
import { DIALOG_CONFIG } from '../../shared/components/dialog/dialog';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../shared/components/stale-chip/stale-chip';
import { StatList, StatRow } from '../../shared/components/stat-list/stat-list';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import {
  AccountCurrencyPipe,
  AppDatePipe,
  PercentPipe,
  PricePipe,
  QuantityPipe,
  SignedMoneyPipe,
} from '../../shared/pipes/format.pipes';
import { toneClass } from '../../shared/utils/format';
import { askGroupName } from './group-dialogs';
import { GroupHoldingDialog, GroupHoldingDialogData } from './group-holding-dialog';
import { GroupTradesDialog, GroupTradesDialogData } from './group-trades-dialog';
import { Pnl } from './pnl';
import { SIDE_LABELS } from './portfolio-labels';
import { displayTicker, groupByDay } from './portfolio-model';
import { TradeDialog, TradeDialogData } from './trade-dialog';
import { TradeTile } from './trade-tile';

/**
 * `/portfolio/groups/:id`: one group (the user's own pie): its value, profit/loss at its own average price, the
 * shares it holds and its trades. Trades are added per stock in a dialog; the header renames or deletes the group.
 */
@Component({
  selector: 'app-group-page',
  imports: [
    AccountCurrencyPipe,
    RouterLink,
    MatButton,
    MatIconButton,
    EmptyState,
    ErrorState,
    HeroAmount,
    PageHeader,
    Skeleton,
    StaleChip,
    StatList,
    StatRow,
    StockLogo,
    TradeTile,
    Icon,
    Pnl,
    AppDatePipe,
    PercentPipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
  ],
  template: `
    <app-page-header
      [title]="title()"
      [back]="true"
      backFallback="/portfolio?tab=groups"
      maxWidth="max-w-3xl"
    >
      @if (data.hasValue()) {
        <div actions class="flex items-center">
          <button
            matIconButton
            type="button"
            aria-label="Rename group"
            i18n-aria-label
            [disabled]="busy()"
            (click)="rename()"
          >
            <app-icon name="edit" />
          </button>
          <button
            matIconButton
            type="button"
            aria-label="Delete group"
            i18n-aria-label
            [disabled]="busy()"
            (click)="remove()"
          >
            <app-icon name="delete" />
          </button>
        </div>
      }
    </app-page-header>

    <div class="mx-auto w-full max-w-3xl px-4 pt-3 pb-10">
      @if (data.error() && !data.hasValue()) {
        @if (notFound()) {
          <app-empty-state
            icon="search_off"
            title="Group not found"
            i18n-title
            text="It may have been deleted."
            i18n-text
          >
            <a matButton="filled" routerLink="/portfolio" [queryParams]="{ tab: 'groups' }" i18n
              >All groups</a
            >
          </app-empty-state>
        } @else {
          <app-error-state [error]="data.error()" (retry)="data.reload()" />
        }
      } @else if (!data.hasValue()) {
        <div class="space-y-3" aria-hidden="true">
          <app-skeleton shape="card" class="h-24" />
          <app-skeleton shape="card" class="h-48" />
          <app-skeleton shape="card" class="h-56" />
        </div>
      } @else {
        @let d = data.value();
        @let g = d.group;
        @let currency = d.accountCurrency | acct;
        @if (d.stale) {
          <div class="mb-3"><app-stale-chip [asOf]="d.asOf" /></div>
        }
        @if (g.oversold.length) {
          <div
            role="status"
            class="mb-4 flex gap-3 rounded-2xl bg-error-container p-3 text-sm text-on-error-container"
          >
            <app-icon name="warning" [size]="20" class="mt-px shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="font-semibold" i18n>This group sells more shares than it bought</p>
              <ul class="mt-1">
                @for (o of g.oversold; track o.t212Ticker) {
                  <li>
                    {{ o.name }}:
                    <ng-container
                      i18n="
                        Shares a group sold without a buy in the group; COUNT is a number of shares
                      "
                      >{{ o.missing | qty }} more sold than bought</ng-container
                    >
                  </li>
                }
              </ul>
              <p class="mt-1" i18n>
                Add their buys to the group, or move those sells out. Until then, the realized
                profit/loss counts only the shares the group holds.
              </p>
            </div>
          </div>
        }
        <p class="app-label" i18n="Current value of a group's shares">Value</p>
        <app-hero-amount class="mt-1" [value]="g.value" [currency]="currency" />
        <p class="mt-1.5 text-[15px] font-semibold">
          <app-pnl [value]="g.totalPnl" [currency]="currency" [pct]="g.totalPnlPct" />
        </p>

        <dl appStatList card class="mt-4">
          <div appStatRow label="Invested" i18n-label="Cost of the shares a group holds now">
            {{ g.invested | price: currency }}
          </div>
          <div
            appStatRow
            label="Unrealized"
            i18n-label="Unrealized profit or loss of open positions"
            term="unrealizedPnl"
          >
            <app-pnl [value]="g.unrealizedPnl" [currency]="currency" />
          </div>
          <div
            appStatRow
            label="Realized"
            i18n-label="Realized profit/loss of the groups' sells"
            term="groupPnl"
          >
            <app-pnl [value]="g.realizedPnl" [currency]="currency" />
          </div>
          <div appStatRow label="Fees" i18n-label="Trading fees and taxes">
            <app-pnl [value]="-g.fees" [currency]="currency" />
          </div>
          <div
            appStatRow
            total
            divider
            label="Total"
            i18n-label="Total profit/loss of a group"
            term="totalPnl"
          >
            <app-pnl [value]="g.totalPnl" [currency]="currency" [pct]="g.totalPnlPct" strong />
          </div>
        </dl>
        <dl appStatList class="mt-1.5">
          <div appStatRow label="Bought" i18n-label>{{ g.bought | price: currency }}</div>
          <div appStatRow label="Sold" i18n-label>{{ g.sold | price: currency }}</div>
        </dl>

        <h2
          class="mt-7 mb-3 px-1 app-title-section"
          i18n="Section heading: the shares a group holds"
        >
          Holdings
        </h2>
        @if (!g.holdings.length) {
          <p class="app-card text-sm text-on-surface-variant" i18n>
            The group holds no shares now.
          </p>
        } @else {
          <ul class="app-card py-1.5">
            @for (h of g.holdings; track h.t212Ticker) {
              <li>
                <button
                  type="button"
                  (click)="openHolding(h)"
                  class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-2xl px-2 py-3 text-left hover:bg-surface-container-high"
                >
                  <app-stock-logo [symbol]="ticker(h)" [logoUrl]="h.logoUrl" [size]="40" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate app-row-title">{{ h.name }}</span>
                    <span class="mt-0.5 block truncate app-row-meta">
                      <span class="uppercase">{{ h.quantity | qty }} {{ ticker(h) }}</span>
                      @if (h.value === null && !d.stale) {
                        ·
                        <ng-container i18n="A group's stock the account no longer holds"
                          >sold outside the group</ng-container
                        >
                      }
                    </span>
                  </span>
                  <span class="flex shrink-0 flex-col items-end text-right">
                    <span class="text-[14px] font-semibold">{{ h.value | price: currency }}</span>
                    <span class="mt-0.5 text-[13px] font-medium" [class]="tone(h.unrealizedPnl)"
                      >{{ h.unrealizedPnl | money: currency }} ({{
                        h.unrealizedPnlPct | pct
                      }})</span
                    >
                  </span>
                </button>
              </li>
            }
          </ul>
        }

        <div class="mt-7 mb-3 flex items-center gap-3 px-1">
          <h2 class="app-title-section min-w-0 flex-1 truncate">
            <ng-container i18n="Section heading: the trades in a group">Trades</ng-container>
            @if (d.trades.length) {
              <span class="ml-1 text-[15px] font-semibold text-on-surface-variant">{{
                d.trades.length
              }}</span>
            }
          </h2>
          <button matButton="tonal" type="button" (click)="addTrades()">
            <app-icon matButtonIcon name="edit" [size]="18" />
            <ng-container i18n="Button that adds or removes trades of a group"
              >Edit trades</ng-container
            >
          </button>
        </div>
        @if (!d.trades.length) {
          <p class="app-card text-sm text-on-surface-variant" i18n>
            Add the buys and sells that belong to this group. Add a stock's buys before its sells.
          </p>
        } @else {
          @for (day of days(); track day.date) {
            <section class="app-card mt-4 pt-3.5 pb-1 first-of-type:mt-0">
              <h3 class="app-title-day">{{ day.date | appDate: 'long' }}</h3>
              <ul>
                @for (t of day.items; track t.id) {
                  <li>
                    <button
                      type="button"
                      (click)="openTrade(t)"
                      class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-2xl px-2 py-[11px] text-left hover:bg-surface-container-high"
                    >
                      <app-trade-tile [kind]="t.side === 'BUY' ? 'buy' : 'sell'" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate app-row-title">{{ t.name }}</span>
                        <span class="flex items-center gap-1 app-row-meta">
                          @if (t.oversold) {
                            <app-icon name="warning" [size]="14" class="shrink-0 text-error" />
                            <span class="sr-only" i18n>Sells more shares than the group held</span>
                          }
                          <span class="min-w-0 truncate">
                            {{ sideLabels[t.side] }} · {{ t.quantity | qty }}
                            @if (t.price !== null) {
                              × {{ t.price | price: t.priceCurrency }}
                            }
                          </span>
                        </span>
                      </span>
                      <span class="flex shrink-0 flex-col items-end text-right">
                        <span class="text-[15px] font-semibold">{{
                          t.value | price: currency
                        }}</span>
                        @if (t.groupRealizedPnl !== null) {
                          <span
                            class="mt-0.5 text-[13px] font-medium"
                            [class]="tone(t.groupRealizedPnl)"
                            >{{ t.groupRealizedPnl | money: currency }}</span
                          >
                        }
                      </span>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        }
      }
    </div>
  `,
})
export class GroupPage {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);

  /** Route parameter. */
  readonly id = input.required<string>();

  protected readonly sideLabels = SIDE_LABELS;
  protected readonly busy = signal(false);
  private readonly version = signal(0);

  protected readonly data = rxResource({
    params: () => ({
      id: this.id(),
      version: this.version() + this.t212.dataVersion(),
    }),
    stream: ({ params }) => this.api.t212Group(params.id, { force: params.version > 0 }),
  });
  protected readonly notFound = computed(() => isApiError(this.data.error(), 'NOT_FOUND'));
  /** The trades by day, newest first. */
  protected readonly days = computed(() =>
    this.data.hasValue() ? groupByDay(this.data.value().trades, (t) => t.executedAt) : [],
  );
  protected readonly title = computed(() =>
    this.data.hasValue() ? this.data.value().group.name : '',
  );

  constructor() {
    void this.t212.load();
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  protected openTrade(trade: T212GroupTrade): void {
    this.dialog.open<TradeDialog, TradeDialogData>(TradeDialog, {
      ...DIALOG_CONFIG,
      data: {
        trade,
        currency: this.data.value()?.accountCurrency ?? null,
        groupChanged: () => this.reload(),
      },
    });
  }

  /** That stock inside the group only, not the whole position in the account. */
  protected async openHolding(holding: T212GroupHolding): Promise<void> {
    const d = this.data.value();
    if (!d) return;
    const ref = this.dialog.open<GroupHoldingDialog, GroupHoldingDialogData, boolean>(
      GroupHoldingDialog,
      {
        ...DIALOG_CONFIG,
        data: {
          holding,
          trades: d.trades.filter((t) => t.t212Ticker === holding.t212Ticker),
          groupId: d.group.id,
          groupName: d.group.name,
          currency: d.accountCurrency,
        },
      },
    );
    if (await firstValueFrom(ref.afterClosed())) this.reload();
  }

  protected async addTrades(): Promise<void> {
    const d = this.data.value();
    if (!d) return;
    const inGroup: Record<string, number> = {};
    for (const t of d.trades) inGroup[t.t212Ticker] = (inGroup[t.t212Ticker] ?? 0) + 1;
    const ref = this.dialog.open<GroupTradesDialog, GroupTradesDialogData, boolean>(
      GroupTradesDialog,
      {
        ...DIALOG_CONFIG,
        data: {
          groupId: d.group.id,
          groupName: d.group.name,
          currency: d.accountCurrency,
          inGroup,
        },
      },
    );
    if (await firstValueFrom(ref.afterClosed())) this.reload();
  }

  protected async rename(): Promise<void> {
    const name = await askGroupName(this.dialog, this.title());
    if (!name || name === this.title()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.t212RenameGroup(this.id(), name));
      this.reload();
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const confirmed = await confirmInDialog(this.dialog, {
      title: $localize`:Dialog title:Delete the group?`,
      message: $localize`Its trades stay in your portfolio, just in no group.`,
      confirm: $localize`:Button that deletes a group:Delete`,
      danger: true,
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.t212DeleteGroup(this.id()), { defaultValue: undefined });
      void this.router.navigate(['/portfolio'], {
        queryParams: { tab: 'groups' },
        replaceUrl: true,
      });
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected ticker(h: T212GroupHolding): string {
    return displayTicker(h);
  }
}
