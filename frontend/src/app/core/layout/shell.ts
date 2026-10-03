import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { periodQuery } from '../../features/portfolio/portfolio-model';
import { UserAvatar } from '../../shared/components/user-avatar/user-avatar';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';
import {
  formatPercent,
  formatPrice,
  formatSignedMoney,
  toneClass,
} from '../../shared/utils/format';
import { providerLabel } from '../../shared/utils/user';
import { ApiService } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { FollowsService } from '../services/follows.service';
import { MenuService } from '../services/menu.service';
import { OnlineService } from '../services/online.service';
import { SessionService } from '../services/session.service';
import { T212Service } from '../services/t212.service';

const ALL_TIME = { preset: 'ALL', from: null, to: null } as const;

interface Tab {
  path: string;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}

/**
 * The signed-in app: a burger menu drawer at every width (opened from the page headers) and an offline banner.
 * Starting it starts the user's live data (settings, follows).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, MatIconButton, Icon, UserAvatar],
  host: { '(document:keydown.escape)': 'menu.hide()' },
  template: `
    <button
      type="button"
      class="sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      (click)="main.focus()"
    >
      <ng-container i18n>Skip to content</ng-container>
    </button>
    @if (!online()) {
      <div
        role="status"
        class="sticky top-0 z-40 flex items-center justify-center gap-2 bg-inverse-surface px-4 pt-safe pb-1.5 text-center text-xs text-inverse-on-surface"
      >
        <app-icon name="cloud_off" [size]="16" />
        <ng-container i18n>You're offline. Showing saved data.</ng-container>
      </div>
    }

    <main #main tabindex="-1" class="min-h-dvh outline-none">
      <router-outlet />
    </main>

    @if (menu.open()) {
      <div class="fixed inset-0 z-50">
        <button
          type="button"
          tabindex="-1"
          aria-hidden="true"
          class="absolute inset-0 bg-scrim"
          (click)="menu.hide()"
        ></button>
        <nav
          role="dialog"
          aria-modal="true"
          aria-label="Main"
          i18n-aria-label="Main navigation"
          class="app-glow absolute inset-y-0 left-0 flex w-77 max-w-[85vw] flex-col rounded-r-[28px] border-r border-outline-variant bg-surface pt-safe pb-safe"
        >
          <div class="flex h-16 items-center gap-2.5 pr-3 pl-5">
            <img src="icons/icon.svg" alt="" width="36" height="36" class="rounded-[11px]" />
            <span class="flex-1 text-xl font-extrabold">Tradiqo</span>
            <button
              #closeButton
              matIconButton
              type="button"
              aria-label="Close menu"
              i18n-aria-label
              (click)="menu.hide()"
            >
              <app-icon name="close" />
            </button>
          </div>
          @if (account(); as a) {
            <a
              routerLink="/portfolio"
              class="mx-4 mt-2 mb-3 block rounded-[20px] bg-surface-container p-4"
            >
              <span
                class="block text-xs font-bold tracking-[.05em] text-on-surface-variant uppercase"
                i18n
                >Account value</span
              >
              <span class="mt-1 block text-[22px] font-semibold">{{ a.value }}</span>
              <span class="mt-0.5 block text-sm font-bold" [class]="a.tone">{{ a.pnl }}</span>
            </a>
          }
          <ul class="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
            @for (tab of tabs; track tab.path) {
              @let active = activeTab() === tab.path;
              <li>
                <a
                  [routerLink]="tab.path"
                  [attr.aria-current]="active ? 'page' : null"
                  class="flex h-13 items-center gap-4 rounded-2xl px-4 text-base font-semibold text-on-surface"
                  [class.bg-secondary-container]="active"
                >
                  <app-icon
                    [name]="active ? tab.activeIcon : tab.icon"
                    [class.text-primary]="active"
                    [class.text-on-surface-variant]="!active"
                  />
                  {{ tab.label }}
                  @if (tab.path === '/followed' && followedCount()) {
                    <span class="ml-auto text-[13px] font-bold text-on-surface-variant">{{
                      followedCount()
                    }}</span>
                  }
                </a>
              </li>
            }
          </ul>
          <div class="mx-5 border-t border-outline-variant"></div>
          <a
            routerLink="/settings"
            [attr.aria-current]="activeTab() === '/settings' ? 'page' : null"
            class="mx-3 mt-2 flex h-13 items-center gap-4 rounded-2xl px-4 text-base font-semibold text-on-surface"
            [class.bg-secondary-container]="activeTab() === '/settings'"
          >
            <app-icon
              name="settings"
              [class.text-primary]="activeTab() === '/settings'"
              [class.text-on-surface-variant]="activeTab() !== '/settings'"
            />
            <ng-container i18n>Settings</ng-container>
          </a>
          @if (user(); as u) {
            <div class="flex items-center gap-3 px-7 pt-3 pb-4">
              <app-user-avatar [user]="u" [size]="36" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-bold">{{ u.displayName || u.email }}</span>
                <span class="block truncate text-xs font-semibold text-on-surface-variant">{{
                  provider()
                }}</span>
              </span>
            </div>
          }
        </nav>
      </div>
    }
  `,
})
export class Shell {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly closeButton = viewChild('closeButton', { read: ElementRef });

  protected readonly menu = inject(MenuService);
  protected readonly online = inject(OnlineService).online;
  private readonly t212 = inject(T212Service);
  private readonly api = inject(ApiService);
  protected readonly user = inject(AuthService).user;
  protected readonly provider = computed(() => providerLabel(this.user()));
  private readonly follows = inject(FollowsService);
  protected readonly followedCount = computed(() => this.follows.symbols().size);

  /** Trading 212 account value and all-time result for the drawer's card, fetched while the drawer is open. */
  private readonly summary = rxResource({
    params: () =>
      this.menu.open() && this.t212.connected()
        ? { query: periodQuery(ALL_TIME), version: this.t212.dataVersion() }
        : undefined,
    stream: ({ params }) => this.api.t212Summary(params.query),
  });
  protected readonly account = computed(() => {
    const s = this.summary.hasValue() ? this.summary.value() : undefined;
    if (!s || s.totalValue === null) return null;
    const pct = s.totalPnlPct === null ? '' : ` (${formatPercent(s.totalPnlPct, 1)})`;
    return {
      value: formatPrice(s.totalValue, s.accountCurrency),
      pnl: formatSignedMoney(s.totalPnl, s.accountCurrency) + pct,
      tone: toneClass(s.totalPnl),
    };
  });
  private readonly sections: Tab[] = [
    { path: '/search', label: $localize`Search`, icon: 'search', activeIcon: 'search' },
    { path: '/followed', label: $localize`Followed`, icon: 'star', activeIcon: 'star-fill' },
    {
      path: '/calendar',
      label: $localize`Calendar`,
      icon: 'calendar_month',
      activeIcon: 'calendar_month',
    },
    {
      path: '/portfolio',
      label: $localize`:Bottom navigation tab:Portfolio`,
      icon: 'account_balance_wallet',
      activeIcon: 'account_balance_wallet',
    },
    { path: '/settings', label: $localize`Settings`, icon: 'settings', activeIcon: 'settings' },
  ];
  /** The drawer lists the sections; Settings sits at the bottom, next to the user. */
  protected readonly tabs = this.sections.filter((t) => t.path !== '/settings');

  /** The tab whose section is showing; none on a stock page. */
  protected readonly activeTab = computed(
    () => this.sections.find((t) => this.url().startsWith(t.path))?.path ?? null,
  );

  constructor() {
    inject(SessionService).start();
    // Navigating closes the drawer; opening it moves focus inside.
    effect(() => {
      this.url();
      this.menu.hide();
    });
    effect(() => this.closeButton()?.nativeElement.focus());
    // The drawer's account card needs to know whether Trading 212 is connected.
    effect(() => {
      if (this.menu.open()) void untracked(() => this.t212.load());
    });
  }
}
