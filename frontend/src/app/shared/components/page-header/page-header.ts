import { Component, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MenuService } from '../../../core/services/menu.service';
import { NavigationService } from '../../../core/services/navigation.service';
import { Icon } from '../../icon/icon';

/**
 * Sticky top app bar below the status bar (safe area): back button or the burger menu button, title, projected actions
 * (`[actions]`) and anything else projected below the bar (tabs, filters).
 */
@Component({
  selector: 'app-page-header',
  imports: [MatIconButton, Icon],
  template: `
    <header
      class="sticky top-0 z-20 bg-surface/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-surface/85"
    >
      <div class="mx-auto flex h-14 items-center gap-1 px-2" [class]="maxWidth()">
        @if (back()) {
          <button
            matIconButton
            type="button"
            aria-label="Back"
            i18n-aria-label
            (click)="navigation.back(backFallback())"
          >
            <app-icon name="arrow_back" />
          </button>
        } @else {
          <button
            matIconButton
            type="button"
            aria-label="Open menu"
            i18n-aria-label
            (click)="menu.show()"
          >
            <app-icon name="menu" />
          </button>
        }
        <h1 class="min-w-0 flex-1 truncate px-2 text-xl font-semibold tracking-tight">
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
}
