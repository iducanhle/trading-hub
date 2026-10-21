import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
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
import { PullToRefresh } from '../../shared/components/pull-to-refresh/pull-to-refresh';
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
import { GroupPnlDialog, GroupPnlDialogData } from './group-pnl-dialog';
import { GroupTradesDialog, GroupTradesDialogData } from './group-trades-dialog';
import { Pnl } from './pnl';
import { SIDE_LABELS } from './portfolio-labels';
import { PortfolioNav } from './portfolio-nav';
import { displayTicker, groupByDay } from './portfolio-model';
import { TradeDialog, TradeDialogData } from './trade-dialog';
import { TradeTile } from './trade-tile';
import { persistedSignal } from '../../shared/utils/persisted-signal';

/** A stock the group traded but holds no shares of now. */
interface FormerHolding {
  t212Ticker: string;
  symbol: string | null;
  name: string;
  lastTradeAt: string;
  /** Sum of its sells' profit/loss at the group's average price; null without sells. */
  realizedPnl: number | null;
}

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
    PullToRefresh,
    Skeleton,
    StaleChip,
    StatList,
    StatRow,
    StockLogo,
    TradeTile,
    Icon,
    Pnl,
    PortfolioNav,
    AppDatePipe,
    PercentPipe,
    PricePipe,
    QuantityPipe,
    SignedMoneyPipe,
  ],
  template: `
    <app-pull-to-refresh
      [refreshing]="t212.syncing() || t212.liveRefreshing()"
      [quiet]="!t212.syncing()"
      (refresh)="sync()"
    >
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

      <div class="mx-auto w-full max-w-3xl px-4 pt-3 pb-nav">
        @if (data.hasValue()) {
          <p
            class="mb-3 text-center text-xs text-on-surface-variant"
            i18n="Live data note|Note under the header: live values refetch automatically"
          >
            Data is refreshed every 10 seconds.
          </p>
        }
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
              class="mb-4 flex gap-3 rounded-2xl bg-primary-container p-3 text-sm text-on-primary-container"
            >
              <app-icon name="info" [size]="20" class="mt-px shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <p class="font-semibold" i18n>This group sells more shares than it bought</p>
                <ul class="mt-1">
                  @for (o of g.oversold; track o.t212Ticker) {
                    <li>
                      {{ o.name }}:
                      <ng-container
                        i18n="
                          Shares a group sold without a buy in the group; COUNT is a number of
                          shares
                        "
                        >{{ o.missing | qty }} more sold than bought</ng-container
                      >
                      ({{ o.missingValue | price: currency }})
                    </li>
                  }
                </ul>
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
              <button
                type="button"
                class="-my-1 -mr-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1.5 hover:bg-surface-container-high"
                [attr.aria-expanded]="investedOpen()"
                (click)="investedOpen.set(!investedOpen())"
              >
                {{ g.invested | price: currency }}
                <app-icon
                  name="keyboard_arrow_down"
                  [size]="18"
                  class="text-on-surface-variant transition-transform duration-200"
                  [class.rotate-180]="investedOpen()"
                />
              </button>
            </div>
            @if (investedOpen()) {
              <!-- pr-3 lines the amounts up with the ones that have a chevron. -->
              <div appStatRow sub label="Bought" i18n-label>
                <span class="pr-3">{{ g.bought | price: currency }}</span>
              </div>
              <div appStatRow sub label="Sold" i18n-label>
                <span class="pr-3">{{ g.sold | price: currency }}</span>
              </div>
            }
            <div appStatRow total label="Total" i18n-label="Total profit/loss of a group">
              <button
                type="button"
                class="-my-1 -mr-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1.5 hover:bg-surface-container-high"
                [attr.aria-expanded]="pnlOpen()"
                (click)="pnlOpen.set(!pnlOpen())"
              >
                <app-pnl [value]="g.totalPnl" [currency]="currency" [pct]="g.totalPnlPct" strong />
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
                label="Unrealized"
                i18n-label="Unrealized profit or loss of open positions"
              >
                <button
                  type="button"
                  class="-my-1 -mr-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1.5 hover:bg-surface-container-high"
                  aria-label="Unrealized by stock"
                  i18n-aria-label="Opens a group's unrealized profit/loss by stock"
                  (click)="openPnl('unrealized')"
                >
                  <app-pnl [value]="g.unrealizedPnl" [currency]="currency" />
                  <app-icon name="chevron_right" [size]="18" class="text-on-surface-variant" />
                </button>
              </div>
              <div appStatRow sub label="Fees" i18n-label="Trading fees and taxes">
                <!-- Lines up with the amounts that have a chevron. -->
                <app-pnl class="pr-3" [value]="-g.fees" [currency]="currency" />
              </div>
              <div
                appStatRow
                sub
                label="Realized"
                i18n-label="Realized profit/loss of the groups' sells"
              >
                <button
                  type="button"
                  class="-my-1 -mr-1.5 inline-flex items-center gap-0.5 rounded-lg py-1 pl-1.5 hover:bg-surface-container-high"
                  aria-label="Realized by stock"
                  i18n-aria-label="Opens a group's realized profit/loss by stock"
                  (click)="openPnl('realized')"
                >
                  <app-pnl [value]="g.realizedPnl" [currency]="currency" />
                  <app-icon name="chevron_right" [size]="18" class="text-on-surface-variant" />
                </button>
              </div>
            }
          </dl>

          <h2 class="mt-7 mb-3">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-surface-container-high"
              [attr.aria-expanded]="holdingsOpen()"
              (click)="holdingsOpen.set(!holdingsOpen())"
            >
              <span class="min-w-0 flex-1 truncate app-title-section">
                <ng-container i18n="Section heading: the shares a group holds"
                  >Holdings</ng-container
                >
                @if (g.holdings.length) {
                  <span class="ml-1 text-[15px] font-semibold text-on-surface-variant">{{
                    g.holdings.length
                  }}</span>
                }
              </span>
              <app-icon
                name="keyboard_arrow_down"
                class="text-on-surface-variant transition-transform duration-200"
                [class.rotate-180]="holdingsOpen()"
              />
            </button>
          </h2>
          @if (holdingsOpen() && !g.holdings.length) {
            <p class="app-card text-sm text-on-surface-variant" i18n>
              The group holds no shares now.
            </p>
          } @else if (holdingsOpen()) {
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

          @if (formerHoldings().length) {
            <h2 class="mt-7 mb-3">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-surface-container-high"
                [attr.aria-expanded]="formerOpen()"
                (click)="formerOpen.set(!formerOpen())"
              >
                <span class="min-w-0 flex-1 truncate app-title-section">
                  <ng-container i18n="Section heading: stocks a group traded but no longer holds"
                    >Former holdings</ng-container
                  >
                  <span class="ml-1 text-[15px] font-semibold text-on-surface-variant">{{
                    formerHoldings().length
                  }}</span>
                </span>
                <app-icon
                  name="keyboard_arrow_down"
                  class="text-on-surface-variant transition-transform duration-200"
                  [class.rotate-180]="formerOpen()"
                />
              </button>
            </h2>
            @if (formerOpen()) {
              <ul class="app-card py-1.5">
                @for (f of formerHoldings(); track f.t212Ticker) {
                  <li>
                    <button
                      type="button"
                      (click)="openFormer(f)"
                      class="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-2xl px-2 py-3 text-left hover:bg-surface-container-high"
                    >
                      <app-stock-logo [symbol]="ticker(f)" [size]="40" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate app-row-title">{{ f.name }}</span>
                        <span class="mt-0.5 block truncate app-row-meta">
                          <span class="uppercase">{{ ticker(f) }}</span> ·
                          {{ f.lastTradeAt | appDate }}
                        </span>
                      </span>
                      <span class="flex shrink-0 flex-col items-end text-right">
                        <span class="text-[14px] font-semibold" [class]="tone(f.realizedPnl)">{{
                          f.realizedPnl | money: currency
                        }}</span>
                        <span
                          class="mt-0.5 app-row-meta"
                          i18n="Under a former holding's profit/loss: it comes from its sells"
                          >realized</span
                        >
                      </span>
                    </button>
                  </li>
                }
              </ul>
            }
          }

          <div class="mt-7 mb-3 flex items-center gap-3">
            <h2 class="min-w-0 flex-1">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-surface-container-high"
                [attr.aria-expanded]="tradesOpen()"
                (click)="tradesOpen.set(!tradesOpen())"
              >
                <span class="min-w-0 flex-1 truncate app-title-section">
                  <ng-container i18n="Section heading: the trades in a group">Trades</ng-container>
                  @if (d.trades.length) {
                    <span class="ml-1 text-[15px] font-semibold text-on-surface-variant">{{
                      d.trades.length
                    }}</span>
                  }
                </span>
                <app-icon
                  name="keyboard_arrow_down"
                  class="text-on-surface-variant transition-transform duration-200"
                  [class.rotate-180]="tradesOpen()"
                />
              </button>
            </h2>
            <button matButton="tonal" type="button" (click)="addTrades()">
              <app-icon matButtonIcon name="edit" [size]="18" />
              <ng-container i18n="Button that adds or removes trades of a group"
                >Edit trades</ng-container
              >
            </button>
          </div>
          @if (tradesOpen() && !d.trades.length) {
            <p class="app-card text-sm text-on-surface-variant" i18n>
              Add the buys and sells that belong to this group. Add a stock's buys before its sells.
            </p>
          } @else if (tradesOpen()) {
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
                              <span class="sr-only" i18n
                                >Sells more shares than the group held</span
                              >
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
      <app-portfolio-nav tab="groups" [detail]="true" />
    </app-pull-to-refresh>
  `,
})
export class GroupPage {
  private readonly api = inject(ApiService);
  protected readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notifier = inject(NotifierService);

  /** Route parameter. */
  readonly id = input.required<string>();

  protected readonly sideLabels = SIDE_LABELS;
  protected readonly busy = signal(false);
  /** Shows the unrealized, fees and realized parts under the total. */
  protected readonly pnlOpen = persistedSignal('portfolio.group.total.expanded', false);
  /** Shows what the group bought and sold under the invested amount. */
  protected readonly investedOpen = persistedSignal('portfolio.group.invested.expanded', false);
  protected readonly holdingsOpen = persistedSignal('portfolio.group.holdings.expanded', true);
  protected readonly formerOpen = persistedSignal('portfolio.group.former.expanded', true);
  protected readonly tradesOpen = persistedSignal('portfolio.group.trades.expanded', true);
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
  /** Stocks the group has trades of but holds no shares of now, most recently traded first. */
  protected readonly formerHoldings = computed(() => {
    if (!this.data.hasValue()) return [];
    const { group, trades } = this.data.value();
    const held = new Set(group.holdings.map((h) => h.t212Ticker));
    const former = new Map<string, FormerHolding>();
    for (const t of trades) {
      if (held.has(t.t212Ticker)) continue;
      let f = former.get(t.t212Ticker);
      if (!f) {
        f = {
          t212Ticker: t.t212Ticker,
          symbol: t.symbol,
          name: t.name,
          lastTradeAt: t.executedAt,
          realizedPnl: null,
        };
        former.set(t.t212Ticker, f);
      }
      if (t.groupRealizedPnl !== null) {
        f.realizedPnl = Math.round(((f.realizedPnl ?? 0) + t.groupRealizedPnl) * 100) / 100;
      }
    }
    return [...former.values()];
  });

  constructor() {
    void this.t212.load();
    inject(DestroyRef).onDestroy(this.t212.watchLive());
    // Values change with prices: refetch quietly on every live tick, keep showing the old value on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        if (!this.data.hasValue()) return;
        const id = this.id();
        this.t212.trackLive(firstValueFrom(this.api.t212Group(id, { force: true }))).then(
          (value) => {
            if (this.data.hasValue() && this.id() === id) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }

  protected reload(): void {
    this.version.update((v) => v + 1);
  }

  /** Pull-to-refresh: syncs with Trading 212, as on the portfolio page. */
  protected async sync(): Promise<void> {
    if (!this.t212.connected() || this.t212.syncing()) return;
    try {
      await this.t212.sync();
      this.reload();
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    }
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

  /** The group's unrealized or realized profit/loss, split by stock. */
  protected openPnl(kind: GroupPnlDialogData['kind']): void {
    const d = this.data.value();
    if (!d) return;
    this.dialog.open<GroupPnlDialog, GroupPnlDialogData>(GroupPnlDialog, {
      ...DIALOG_CONFIG,
      data: {
        kind,
        group: d.group,
        trades: d.trades,
        currency: d.accountCurrency,
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

  /** A former holding opens the same dialog as a holding, with no shares left. */
  protected openFormer(f: FormerHolding): void {
    void this.openHolding({
      t212Ticker: f.t212Ticker,
      symbol: f.symbol,
      name: f.name,
      logoUrl: null,
      quantity: 0,
      invested: 0,
      value: 0,
      unrealizedPnl: 0,
      unrealizedPnlPct: null,
    });
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

  /** Only an empty group can be deleted (the backend refuses too), so its trades are never ungrouped by accident. */
  protected async remove(): Promise<void> {
    if (this.data.hasValue() && this.data.value().group.tradeCount > 0) {
      void this.notifier.show($localize`Take the trades out of the group first.`);
      return;
    }
    const confirmed = await confirmInDialog(this.dialog, {
      title: $localize`:Dialog title:Delete the group?`,
      message: $localize`The group has no trades, so nothing else changes.`,
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

  protected ticker(h: { symbol: string | null; t212Ticker: string }): string {
    return displayTicker(h);
  }
}
