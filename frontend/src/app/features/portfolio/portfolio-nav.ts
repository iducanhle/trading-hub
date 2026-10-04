import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';
import { TAB_LABELS } from './portfolio-labels';
import { PORTFOLIO_TABS, PortfolioTab } from './portfolio-model';

const TAB_ICONS: Record<PortfolioTab, IconName> = {
  overview: 'pie_chart',
  stocks: 'candlestick_chart',
  trades: 'swap_vert',
  cash: 'payments',
};

/**
 * The portfolio's sections as a floating glass pill pinned to the bottom of the screen (like the iOS tab bar): an
 * icon over a label per section and a highlight that slides to the active one. It keeps clear of the home indicator
 * and, on wide screens, centres in the area right of the docked navigation. The tab lives in the URL (`?tab=`).
 */
@Component({
  selector: 'app-portfolio-nav',
  imports: [RouterLink, Icon],
  host: {
    class:
      'pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(calc(env(safe-area-inset-bottom)_-_20px),12px)] lg:left-77',
  },
  template: `
    <nav
      class="pointer-events-auto relative grid w-full max-w-[22rem] grid-cols-4 rounded-full bg-surface-container-high/70 p-1.5 ring-1 ring-outline-variant backdrop-blur-xl backdrop-saturate-150 supports-not-[backdrop-filter]:bg-surface-container-high"
      aria-label="Portfolio sections"
      i18n-aria-label
    >
      <span
        class="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/4)] rounded-full bg-surface-container-highest ring-1 ring-outline-variant transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        [style.transform]="'translateX(' + index() * 100 + '%)'"
        aria-hidden="true"
      ></span>
      @for (t of tabs; track t) {
        <a
          [routerLink]="[]"
          [queryParams]="{ tab: t === 'overview' ? null : t }"
          queryParamsHandling="merge"
          replaceUrl
          [attr.aria-current]="tab() === t ? 'page' : null"
          class="relative flex min-w-0 flex-col items-center gap-0.5 rounded-full px-1 pt-2 pb-1.5 text-[11px] leading-tight font-bold transition-colors duration-200"
          [class]="
            tab() === t ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
          "
        >
          <app-icon [name]="icons[t]" [size]="22" />
          <span class="max-w-full truncate">{{ labels[t] }}</span>
        </a>
      }
    </nav>
  `,
})
export class PortfolioNav {
  readonly tab = input.required<PortfolioTab>();

  protected readonly tabs = PORTFOLIO_TABS;
  protected readonly labels = TAB_LABELS;
  protected readonly icons = TAB_ICONS;
  protected readonly index = computed(() => PORTFOLIO_TABS.indexOf(this.tab()));
}
