import { Component, inject, input, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MenuService } from '../../../core/services/menu.service';
import { NavigationService } from '../../../core/services/navigation.service';
import { Icon } from '../../icon/icon';

/**
 * Sticky top app bar below the status bar (safe area): back button or the burger menu button, title, projected actions
 * (`[actions]`) and anything else projected below the bar (tabs, filters). Transparent at the top of the page, so the
 * dark theme's glow shows through; once the page scrolls it gets the page colour and a divider.
 * Section pages show the title in capitals (`app-title-page`); pages with a back button in normal case.
 */
@Component({
  selector: 'app-page-header',
  imports: [MatIconButton, Icon],
  host: { '(window:scroll)': 'onScroll()' },
  template: `
    <header
      class="sticky top-0 z-20 pt-safe transition-colors duration-150"
      [class]="
        scrolled()
          ? 'border-b border-outline-variant bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80'
          : 'border-b border-transparent'
      "
    >
      <div class="mx-auto flex h-16 items-center gap-1 px-2" [class]="maxWidth()">
        @if (back()) {
          <button
            matIconButton
            type="button"
            aria-label="Back"
            i18n-aria-label
            (click)="navigation.back(backFallback())"
          >
            <app-icon name="arrow_back" [size]="26" />
          </button>
        } @else {
          <button
            matIconButton
            type="button"
            class="lg:hidden!"
            aria-label="Open menu"
            i18n-aria-label
            (click)="menu.show()"
          >
            <app-icon name="menu" [size]="26" />
          </button>
        }
        <h1
          class="min-w-0 flex-1 truncate px-1"
          [class]="back() ? 'app-title-page-back' : 'app-title-page'"
        >
          <ng-content select="[title]" />{{ title() }}
        </h1>
        <ng-content select="[actions]" />
      </div>
      <ng-content />
    </header>
  `,
})
export class PageHeader {
  protected readonly navigation = inject(NavigationService);
  protected readonly menu = inject(MenuService);
  readonly title = input('');
  readonly back = input(false);
  readonly backFallback = input('/followed');
  /** Tailwind max-width of the bar, matching the page content. */
  readonly maxWidth = input('max-w-2xl');

  protected readonly scrolled = signal(window.scrollY > 4);

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 4);
  }
}
