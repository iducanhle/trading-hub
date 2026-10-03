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
 * The signed-in app: a burger menu drawer at every width (opened from the page headers) and an offline banner.
 * Starting it starts the user's live data (settings, follows).
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
  private readonly closeButton = viewChild('closeButton', { read: ElementRef });

  protected readonly menu = inject(MenuService);
  protected readonly online = inject(OnlineService).online;
  protected readonly tabs: Tab[] = [
    { path: '/search', label: $localize`Search`, icon: 'search', activeIcon: 'search' },
    { path: '/followed', label: $localize`Followed`, icon: 'star', activeIcon: 'star-fill' },
    {
      path: '/calendar',
      label: $localize`Calendar`,
      icon: 'calendar_month',
      activeIcon: 'calendar_month',
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
      activeIcon: 'account_balance_wallet',
    },
    {
      path: '/settings',
      label: $localize`Settings`,
      icon: 'settings',
      activeIcon: 'settings',
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
