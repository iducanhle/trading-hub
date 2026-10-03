import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { distinctUntilChanged, map, of, switchMap, timer } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { SearchResult } from '../../core/models/contract';
import { MenuService } from '../../core/services/menu.service';
import { RecentSearchesService } from '../../core/services/recent-searches.service';
import { EmptyState } from '../../shared/components/empty-state/empty-state';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Icon } from '../../shared/icon/icon';
import { StockRow } from './stock-row';

@Component({
  selector: 'app-search-page',
  imports: [MatIconButton, Icon, StockRow, Skeleton, EmptyState, ErrorState],
  template: `
    <header
      class="sticky top-0 z-20 bg-surface/90 pt-safe pr-4 pb-2 pl-2 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
    >
      <div class="mx-auto max-w-2xl pt-3">
        <h1 class="sr-only" i18n>Search</h1>
        <div class="flex items-center gap-1">
          <button
            matIconButton
            type="button"
            class="shrink-0"
            aria-label="Open menu"
            i18n-aria-label
            (click)="menu.show()"
          >
            <app-icon name="menu" [size]="26" />
          </button>
          <div class="relative min-w-0 flex-1">
            <app-icon
              name="search"
              class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-on-surface-variant"
              [size]="20"
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
              class="h-[50px] w-full rounded-2xl bg-surface-container pr-12 pl-11 text-base font-semibold text-on-surface outline-none placeholder:font-medium placeholder:text-on-surface-variant focus:ring-[1.5px] focus:ring-primary [&::-webkit-search-cancel-button]:hidden"
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

    <div class="mx-auto max-w-2xl px-4 pb-6">
      @if (!term()) {
        @if (recent.items().length) {
          <section class="app-card mt-4 pt-4 pb-1.5">
            <div class="flex items-center justify-between">
              <h2 class="app-label" i18n="Recent searches">Recent</h2>
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
          <h2 class="app-label px-1 pt-5 pb-1">
            <ng-container i18n>Results</ng-container> · {{ list.length }}
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
        <ul aria-busy="true" aria-label="Searching" i18n-aria-label>
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <li class="flex items-center gap-3.5 py-[13px]">
              <app-skeleton class="size-12 rounded-[14px]" />
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
  protected readonly menu = inject(MenuService);
  protected readonly recent = inject(RecentSearchesService);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** `?q=` from the URL, so going back from a stock page restores the results. */
  readonly q = input<string>();
  protected readonly query = linkedSignal(() => this.q() ?? '');

  /** The query after 300 ms without typing (the first value, e.g. from the URL, applies at once). */
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
  }

  protected onInput(value: string): void {
    this.query.set(value);
    void this.router.navigate([], { queryParams: { q: value.trim() || null }, replaceUrl: true });
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
