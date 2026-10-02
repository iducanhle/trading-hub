import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';
import { OnlineService } from '../services/online.service';
import { SessionService } from '../services/session.service';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}

/**
 * The signed-in app: a bottom tab bar on phones (above the home indicator), a navigation rail from `lg` up,
 * and an offline banner. Starting it starts the user's live data (settings, follows).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, Icon],
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
        class="sticky top-0 z-40 flex items-center justify-center gap-2 bg-inverse-surface px-4 pt-safe pb-1.5 text-center text-xs text-inverse-on-surface lg:ml-24"
      >
        <app-icon name="cloud_off" [size]="16" />
        <ng-container i18n>You're offline. Showing saved data.</ng-container>
      </div>
    }

    <main
      #main
      tabindex="-1"
      class="min-h-dvh outline-none pb-[calc(var(--app-bottom-nav-height)+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-24"
    >
      <router-outlet />
    </main>

    <nav
      aria-label="Main"
      i18n-aria-label="Main navigation"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface-container pb-safe lg:inset-y-0 lg:right-auto lg:w-24 lg:border-t-0 lg:border-r lg:pt-safe lg:pb-0"
    >
      <ul
        class="mx-auto flex h-(--app-bottom-nav-height) max-w-md items-stretch justify-around lg:h-full lg:max-w-none lg:flex-col lg:justify-start lg:gap-2 lg:pt-4"
      >
        <li class="hidden lg:mb-4 lg:flex lg:justify-center" aria-hidden="true">
          <img src="icons/icon.svg" alt="" width="40" height="40" class="rounded-xl" />
        </li>
        @for (tab of tabs; track tab.path) {
          @let active = activeTab() === tab.path;
          <li class="flex flex-1 lg:flex-none">
            <a
              [routerLink]="tab.path"
              [attr.aria-current]="active ? 'page' : null"
              class="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium lg:py-2"
              [class.text-on-surface]="active"
              [class.text-on-surface-variant]="!active"
            >
              <span
                class="flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200"
                [class.bg-secondary-container]="active"
                [class.text-on-secondary-container]="active"
              >
                <app-icon [name]="active ? tab.activeIcon : tab.icon" />
              </span>
              {{ tab.label }}
            </a>
          </li>
        }
      </ul>
    </nav>
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

  protected readonly online = inject(OnlineService).online;
  protected readonly tabs: Tab[] = [
    { path: '/search', label: $localize`Search`, icon: 'search', activeIcon: 'search' },
    { path: '/followed', label: $localize`Followed`, icon: 'star', activeIcon: 'star-fill' },
    {
      path: '/calendar',
      label: $localize`Calendar`,
      icon: 'calendar_month',
      activeIcon: 'calendar_month-fill',
    },
    {
      path: '/events',
      label: $localize`Events`,
      icon: 'bolt',
      activeIcon: 'bolt-fill',
    },
    {
      path: '/portfolio',
      label: $localize`:Bottom navigation tab:Portfolio`,
      icon: 'account_balance_wallet',
      activeIcon: 'account_balance_wallet-fill',
    },
    {
      path: '/settings',
      label: $localize`Settings`,
      icon: 'settings',
      activeIcon: 'settings-fill',
    },
  ];

  /** The tab whose section is showing; none on a stock page. */
  protected readonly activeTab = computed(
    () => this.tabs.find((t) => this.url().startsWith(t.path))?.path ?? null,
  );

  constructor() {
    inject(SessionService).start();
  }
}
