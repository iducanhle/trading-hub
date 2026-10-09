import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { APP_NAME } from '../../core/services/app-title.strategy';
import { CompareService } from '../../core/services/compare.service';
import { T212Service } from '../../core/services/t212.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { PortfolioNav } from '../portfolio/portfolio-nav';
import { StockDetailPage } from '../stock-detail/stock-detail-page';
import { PageSwipe } from './page-swipe';

/** How long a restore keeps trying while the page below loads (deferred sections grow it as they come into view). */
const RESTORE_MS = 1500;
/** On entering the page, the restore also holds a moment against the router's own scroll to the top. */
const ENTER_HOLD_MS = 300;

/**
 * `/compare`: the stocks in the compare list, one at a time, each as its full stock page; the header's chevrons
 * and long sideways swipes switch between them. Every stock in the list stays rendered (only the shown one is
 * visible), so its data, chart and opened sections are kept, and each one returns to where it was scrolled.
 */
@Component({
  selector: 'app-compare-page',
  imports: [PageHeader, EmptyState, StockDetailPage, PortfolioNav, PageSwipe],
  template: `
    @if (compare.items().length === 0) {
      <app-page-header title="Compare" i18n-title="Page title" />
      <div class="mx-auto max-w-2xl" [class]="t212.connected() ? 'pb-nav' : 'pb-end'">
        <app-empty-state
          icon="compare"
          title="Nothing to compare yet"
          i18n-title
          text="Open a stock and tap the compare button at the bottom right to add it here."
          i18n-text
        />
      </div>
    }
    <!-- Clipped so the page following a swipe never scrolls the window sideways (clip keeps sticky headers). -->
    <div
      #pages
      class="overflow-x-clip"
      appPageSwipe
      [swipeEnabled]="compare.items().length > 1"
      (swipeLeft)="swipe(1)"
      (swipeRight)="swipe(-1)"
    >
      @for (item of compare.items(); track item.symbol) {
        @let shown = item.symbol === compare.active();
        <app-stock-detail-page
          compareMode
          [symbol]="item.symbol"
          [active]="shown"
          [class.hidden]="!shown"
          [attr.inert]="shown ? null : ''"
        />
      }
    </div>
    @if (t212.connected()) {
      <app-portfolio-nav tab="compare" />
    }
  `,
})
export class ComparePage {
  protected readonly compare = inject(CompareService);
  protected readonly t212 = inject(T212Service);
  private readonly injector = inject(Injector);
  private readonly title = inject(Title);
  private readonly view = inject(DOCUMENT).defaultView!;
  private readonly pages = viewChild<ElementRef<HTMLElement>>('pages');
  private frame?: ReturnType<typeof setTimeout>;
  private entering = true;

  constructor() {
    // Entering the page restores the shown stock's offset; until then the router's own scroll must not record it.
    this.compare.switching = true;

    const onScroll = () => {
      const symbol = this.compare.active();
      if (symbol && !this.compare.switching) this.compare.positions.set(symbol, this.view.scrollY);
    };
    // Scrolling by hand ends a restore still in progress.
    const onUser = () => this.finish();
    const passive = { passive: true };
    this.view.addEventListener('scroll', onScroll, passive);
    // Leaving the page records the offset too, before the next page replaces this one (and in case no scroll event
    // was delivered, e.g. in a background tab).
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => onScroll());
    for (const type of ['wheel', 'touchstart', 'keydown'] as const)
      this.view.addEventListener(type, onUser, passive);
    inject(DestroyRef).onDestroy(() => {
      this.finish();
      this.view.removeEventListener('scroll', onScroll);
      for (const type of ['wheel', 'touchstart', 'keydown'] as const)
        this.view.removeEventListener(type, onUser);
    });

    effect(() => {
      const symbol = this.compare.active();
      untracked(() => {
        if (!symbol) {
          this.title.setTitle(`${$localize`:Page title:Compare`} · ${APP_NAME}`);
          return this.finish();
        }
        this.compare.switching = true;
        const hold = this.entering ? ENTER_HOLD_MS : 0;
        this.entering = false;
        afterNextRender(() => this.restore(this.compare.positions.get(symbol) ?? 0, hold), {
          injector: this.injector,
        });
      });
    });
  }

  /** Swiping left shows the next stock, right the previous one; it slides in from the side the finger came from. */
  protected swipe(delta: number): void {
    this.compare.step(delta);
    afterNextRender(
      () => {
        const shown = this.pages()?.nativeElement.querySelector(':scope > :not(.hidden)');
        if (!shown || this.view.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        shown.animate(
          [
            { transform: `translateX(${delta * 48}px)`, opacity: 0.4 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
        );
      },
      { injector: this.injector },
    );
  }

  /** Scrolls to the stock's offset, retrying while the page is still too short to reach it. */
  private restore(top: number, hold: number): void {
    clearTimeout(this.frame);
    const start = performance.now();
    const step = () => {
      this.view.scrollTo({ top, behavior: 'instant' });
      const elapsed = performance.now() - start;
      const reached = Math.abs(this.view.scrollY - top) < 2;
      if ((reached && elapsed >= hold) || elapsed > RESTORE_MS) return this.finish();
      this.frame = setTimeout(step, 16);
    };
    step();
  }

  private finish(): void {
    clearTimeout(this.frame);
    this.compare.switching = false;
  }
}
