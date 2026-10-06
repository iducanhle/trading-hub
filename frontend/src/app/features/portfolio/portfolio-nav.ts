import {
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { SearchService } from '../../core/services/search.service';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';
import { TAB_LABELS } from './portfolio-labels';
import { PORTFOLIO_TABS, PortfolioTab } from './portfolio-model';

/** The portfolio sections plus search; `search` is the active item on a stock's detail page. */
export type NavTab = PortfolioTab | 'search';
const NAV_TABS: readonly NavTab[] = [...PORTFOLIO_TABS, 'search'];

const TAB_ICONS: Record<NavTab, IconName> = {
  overview: 'pie_chart',
  stocks: 'candlestick_chart',
  trades: 'swap_vert',
  cash: 'payments',
  search: 'search',
};

const NAV_LABELS: Record<NavTab, string> = { ...TAB_LABELS, search: $localize`Search` };

/** The last stock detail URL the pill was on (in memory only), so Search can lead back to it. */
@Injectable({ providedIn: 'root' })
class LastStockMemory {
  url: string | null = null;
}

/**
 * The portfolio's sections as a floating glass pill pinned to the bottom of the screen (like the iOS tab bar): an
 * icon over a label per section and a highlight that slides to the active one. It keeps clear of the home indicator
 * and, on wide screens, centres in the area right of the docked navigation. The tab lives in the URL (`?tab=`). The
 * last item opens the search overlay; it shows as active on a stock's detail page, where the portfolio items link
 * back to `/portfolio`.
 */
@Component({
  selector: 'app-portfolio-nav',
  imports: [RouterLink, Icon],
  host: {
    class:
      'pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(calc(env(safe-area-inset-bottom)_-_20px),12px)] lg:left-77',
    // While searching, the pill is a manual popover shown after the search dialog (itself a top-layer popover), so
    // it sits above it; these undo the popover's default box.
    '[attr.popover]': "search.isOpen() ? 'manual' : null",
    '[style.top]': "search.isOpen() ? 'auto' : null",
    '[style.margin]': 'search.isOpen() ? 0 : null',
    '[style.border]': 'search.isOpen() ? 0 : null',
    '[style.background]': "search.isOpen() ? 'transparent' : null",
    '[style.width]': "search.isOpen() ? 'auto' : null",
    '[style.height]': "search.isOpen() ? 'auto' : null",
    '[style.overflow]': "search.isOpen() ? 'visible' : null",
    '[style.color]': "search.isOpen() ? 'inherit' : null",
  },
  template: `
    <nav
      class="pointer-events-auto relative grid w-full max-w-[24rem] grid-cols-5 rounded-full bg-surface-container-high/70 p-1.5 ring-1 ring-outline-variant backdrop-blur-xl backdrop-saturate-150 supports-not-[backdrop-filter]:bg-surface-container-high"
      aria-label="Portfolio sections"
      i18n-aria-label
    >
      <span
        class="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)] rounded-full bg-surface-container-highest ring-1 ring-outline-variant transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        [style.transform]="'translateX(' + index() * 100 + '%)'"
        aria-hidden="true"
      ></span>
      @for (t of tabs; track t) {
        @if (t === 'search') {
          <button
            type="button"
            (click)="onSearch()"
            [attr.aria-current]="current() === t ? 'page' : null"
            [class]="itemClass(t)"
          >
            <app-icon [name]="icons[t]" [size]="22" />
            <span class="max-w-full truncate">{{ labels[t] }}</span>
          </button>
        } @else if (onPortfolio()) {
          <a
            [routerLink]="[]"
            [queryParams]="{ tab: t === 'overview' ? null : t }"
            queryParamsHandling="merge"
            replaceUrl
            [attr.aria-current]="current() === t ? 'page' : null"
            [class]="itemClass(t)"
            (click)="search.close()"
          >
            <app-icon [name]="icons[t]" [size]="22" />
            <span class="max-w-full truncate">{{ labels[t] }}</span>
          </a>
        } @else {
          <a
            routerLink="/portfolio"
            [queryParams]="{ tab: t === 'overview' ? null : t }"
            [class]="itemClass(t)"
            (click)="search.close()"
          >
            <app-icon [name]="icons[t]" [size]="22" />
            <span class="max-w-full truncate">{{ labels[t] }}</span>
          </a>
        }
      }
    </nav>
  `,
})
export class PortfolioNav {
  readonly tab = input.required<NavTab>();

  protected readonly search = inject(SearchService);
  private readonly router = inject(Router);
  private readonly memory = inject(LastStockMemory);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly tabs = NAV_TABS;
  protected readonly labels = NAV_LABELS;
  protected readonly icons = TAB_ICONS;
  /** The highlighted item: Search while the overlay is open, else the page's tab. */
  protected readonly current = computed<NavTab>(() =>
    this.search.isOpen() ? 'search' : this.tab(),
  );
  protected readonly index = computed(() => NAV_TABS.indexOf(this.current()));
  /** On the portfolio page the items swap `?tab=`; elsewhere they navigate to it. */
  protected readonly onPortfolio = computed(() => this.tab() !== 'search');

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    effect(() => {
      if (!this.search.isOpen()) return;
      // After the popover attribute is bound, raise the pill into the top layer above the dialog.
      afterNextRender(
        () => {
          if (host.hasAttribute('popover') && !host.matches(':popover-open')) host.showPopover();
        },
        { injector: this.injector },
      );
    });
    // On a detail page, remember it (and each stock opened from there) so Search can return to it.
    afterNextRender(() => {
      if (this.onPortfolio()) return;
      this.memory.url = this.router.url;
      this.router.events
        .pipe(
          filter((e) => e instanceof NavigationEnd),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          if (this.router.url.startsWith('/stock/')) this.memory.url = this.router.url;
        });
    });
  }

  /** From the portfolio, Search returns to the last stock; on a stock, it forgets it and opens search. */
  protected onSearch(): void {
    if (this.search.isOpen()) return;
    const last = this.memory.url;
    if (this.onPortfolio() && last) {
      void this.router.navigateByUrl(last);
      return;
    }
    this.memory.url = null;
    void this.search.open();
  }

  protected itemClass(t: NavTab): string {
    return (
      'relative flex min-w-0 flex-col items-center gap-0.5 rounded-full px-1 pt-2 pb-1.5 text-[11px] leading-tight font-bold transition-colors duration-200 ' +
      (this.current() === t ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface')
    );
  }
}
