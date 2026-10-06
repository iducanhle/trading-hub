import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { NavigationStart, Router } from '@angular/router';
import { distinctUntilChanged, filter, map, of, switchMap, timer } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { SearchResult } from '../../core/models/contract';
import { RecentSearchesService } from '../../core/services/recent-searches.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Icon } from '../../shared/icon/icon';
import { StockRow } from './stock-row';

/** Stock search, opened over the current page by SearchService (the `/search` route is disabled). */
@Component({
  selector: 'app-search-page',
  imports: [MatIconButton, Icon, StockRow, Skeleton, EmptyState, ErrorState],
  template: `
    <header
      class="sticky top-0 z-20 min-w-0 bg-surface/90 pt-safe pr-4 pb-2 pl-2 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <div class="mx-auto max-w-2xl pt-3">
        <h1 class="sr-only" i18n>Search</h1>
        <div class="flex items-center gap-1">
          <button
            matIconButton
            type="button"
            class="shrink-0"
            aria-label="Back"
            i18n-aria-label
            (click)="close()"
          >
            <app-icon name="arrow_back" [size]="26" />
          </button>
          <div class="relative min-w-0 flex-1">
            <app-icon
              name="search"
              class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-on-surface-variant"
              [size]="18"
            />
            <input
              #input
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              aria-label="Search stocks by symbol or name"
              i18n-aria-label
              placeholder="Symbol or company, e.g. AAPL, SAP.DE"
              i18n-placeholder
              class="h-10 w-full rounded-[14px] bg-surface-container pr-12 pl-10 text-[13px] text-on-surface outline-none placeholder:text-on-surface-variant focus:ring-[1.5px] focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
              [value]="query()"
              (input)="onInput(input.value)"
              (keydown.enter)="openFirst()"
            />
            @if (query()) {
              <button
                matIconButton
                type="button"
                aria-label="Clear search"
                i18n-aria-label
                class="absolute! top-1/2 right-0.5 -translate-y-1/2 text-on-surface-variant"
                (click)="clear()"
              >
                <app-icon name="close" [size]="20" />
              </button>
            }
          </div>
        </div>
      </div>
    </header>

    <!-- Bottom padding keeps results clear of the portfolio pill, which stays above the overlay. -->
    <div class="mx-auto w-full max-w-2xl min-w-0 px-4 pb-28">
      @if (!term()) {
        @if (recent.items().length) {
          <section class="app-card mt-1 pt-4 pb-1.5">
            <div class="flex items-center justify-between">
              <h2 class="app-title-card" i18n="Recent searches">Recent</h2>
              <button
                type="button"
                class="-my-2 py-2 text-sm font-bold text-primary"
                (click)="recent.clear()"
              >
                <ng-container i18n>Clear</ng-container>
              </button>
            </div>
            <ul class="mt-1">
              @for (stock of recent.items(); track stock.symbol) {
                <li><app-stock-row [stock]="stock" /></li>
              }
            </ul>
          </section>
        } @else {
          <app-empty-state
            icon="search"
            title="Search US and European stocks"
            i18n-title
            text="Type a ticker or a company name, for example AAPL, SAP.DE or Nestlé."
            i18n-text
          />
        }
      } @else if (results.error()) {
        <div class="pt-4">
          <app-error-state [error]="results.error()" (retry)="results.reload()" />
        </div>
      } @else if (shown(); as list) {
        @if (list.length || results.isLoading()) {
          <h2 class="flex items-baseline gap-2 px-1 pt-4 pb-1 app-title-section">
            <ng-container i18n>Results</ng-container>
            <span class="text-[15px] font-semibold text-on-surface-variant">{{ list.length }}</span>
          </h2>
          <ul
            aria-live="polite"
            [attr.aria-busy]="results.isLoading()"
            [class.opacity-60]="results.isLoading()"
          >
            @for (stock of list; track stock.symbol) {
              <li><app-stock-row follow [stock]="stock" /></li>
            }
          </ul>
        } @else {
          <app-empty-state
            icon="search_off"
            title="No matches"
            i18n-title
            [text]="noMatchesText()"
          />
        }
      } @else {
        <ul class="mt-4" aria-busy="true" aria-label="Searching" i18n-aria-label>
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <li class="flex items-center gap-3 py-[11px]">
              <app-skeleton class="size-10 rounded-xl" />
              <span class="flex-1 space-y-2">
                <app-skeleton class="h-4 w-20" />
                <app-skeleton class="h-3 w-48" />
              </span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class SearchPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly recent = inject(RecentSearchesService);
  private readonly dialogRef = inject<MatDialogRef<SearchPage>>(MatDialogRef);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');

  /** The query after 300 ms without typing (the first, empty value applies at once). */
  protected readonly term = toSignal(
    toObservable(this.query).pipe(
      map((q) => q.trim()),
      distinctUntilChanged(),
      switchMap((q, index) => (index === 0 ? of(q) : timer(300).pipe(map(() => q)))),
    ),
    { initialValue: '' },
  );
  protected readonly noMatchesText = computed(
    () =>
      $localize`Nothing found for “${this.term()}:query:”. Check the symbol, or try the company name.`,
  );

  protected readonly results = rxResource({
    params: () => this.term() || undefined,
    stream: ({ params }) => this.api.search(params, 10),
  });

  /** The latest results, kept on screen (dimmed) while the next query loads. */
  protected readonly shown = linkedSignal<SearchResult[] | undefined, SearchResult[] | undefined>({
    source: () => (this.results.hasValue() ? this.results.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  });

  private readonly first = computed(() => this.shown()?.[0]);

  constructor() {
    afterNextRender(() => this.input().nativeElement.focus());
    // Opening a result (or any other navigation) closes the overlay.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.dialogRef.close());
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected onInput(value: string): void {
    this.query.set(value);
  }

  protected clear(): void {
    this.onInput('');
    this.input().nativeElement.focus();
  }

  protected openFirst(): void {
    const first = this.first();
    if (first) void this.router.navigate(['/stock', first.symbol]);
  }
}
