import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';
import { MenuService } from '../services/menu.service';
import { OnlineService } from '../services/online.service';
import { SessionService } from '../services/session.service';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
  activeIcon: IconName;
}

/**
 * The signed-in app: a burger menu drawer on phones (opened from the page headers), a navigation rail from `lg` up,
 * and an offline banner. Starting it starts the user's live data (settings, follows).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, MatIconButton, Icon],
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
        class="sticky top-0 z-40 flex items-center justify-center gap-2 bg-inverse-surface px-4 pt-safe pb-1.5 text-center text-xs text-inverse-on-surface lg:ml-24"
      >
        <app-icon name="cloud_off" [size]="16" />
        <ng-container i18n>You're offline. Showing saved data.</ng-container>
      </div>
    }

    <main #main tabindex="-1" class="min-h-dvh outline-none lg:pl-24">
      <router-outlet />
    </main>

    <nav
      aria-label="Main"
      i18n-aria-label="Main navigation"
      class="fixed inset-y-0 left-0 z-30 hidden w-24 border-r border-outline-variant bg-surface-container pt-safe lg:block"
    >
      <ul class="flex h-full flex-col justify-start gap-2 pt-4">
        <li class="mb-4 flex justify-center" aria-hidden="true">
          <img src="icons/icon.svg" alt="" width="40" height="40" class="rounded-xl" />
        </li>
        @for (tab of tabs; track tab.path) {
          @let active = activeTab() === tab.path;
          <li class="flex">
            <a
              [routerLink]="tab.path"
              [attr.aria-current]="active ? 'page' : null"
              class="flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium"
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

    @if (menu.open()) {
      <div class="fixed inset-0 z-50 lg:hidden">
        <button
          type="button"
          tabindex="-1"
          aria-hidden="true"
          class="absolute inset-0 bg-scrim/32"
          (click)="menu.hide()"
        ></button>
        <nav
          role="dialog"
          aria-modal="true"
          aria-label="Main"
          i18n-aria-label="Main navigation"
          class="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface-container pt-safe pb-safe shadow-xl"
        >
          <div class="flex h-14 items-center gap-2 pr-2 pl-4">
            <img src="icons/icon.svg" alt="" width="32" height="32" class="rounded-lg" />
            <span class="flex-1 text-lg font-semibold tracking-tight">Tradiqo</span>
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
          <ul class="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            @for (tab of tabs; track tab.path) {
              @let active = activeTab() === tab.path;
              <li>
                <a
                  [routerLink]="tab.path"
                  [attr.aria-current]="active ? 'page' : null"
                  class="flex h-14 items-center gap-3 rounded-full px-4 text-sm font-medium"
                  [class.bg-secondary-container]="active"
                  [class.text-on-secondary-container]="active"
                  [class.text-on-surface-variant]="!active"
                >
                  <app-icon [name]="active ? tab.activeIcon : tab.icon" />
                  {{ tab.label }}
                </a>
              </li>
            }
          </ul>
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
  private readonly closeButton = viewChild<ElementRef<HTMLElement>>('closeButton');

  protected readonly menu = inject(MenuService);
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
    // Navigating closes the drawer; opening it moves focus inside.
    effect(() => {
      this.url();
      this.menu.hide();
    });
    effect(() => this.closeButton()?.nativeElement.focus());
  }
}
