import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { Icon } from '../../../shared/icon/icon';
import { TimeAgoPipe } from '../../../shared/pipes/format.pipes';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

/** Section 11: latest headlines, opening in a new tab (hidden when there are none). */
@Component({
  selector: 'app-news',
  imports: [Section, ErrorState, Skeleton, Icon, TimeAgoPipe],
  template: `
    @if (!news.hasValue() || items().length) {
      <app-section title="News" [(expanded)]="expanded">
        @if (news.error()) {
          <app-error-state compact [error]="news.error()" (retry)="news.reload()" />
        } @else if (!news.hasValue()) {
          <div class="space-y-4" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <div class="flex gap-3">
                <app-skeleton class="h-10 flex-1" /><app-skeleton class="size-16" />
              </div>
            }
          </div>
        } @else {
          <ul class="divide-y divide-outline-variant/60">
            @for (item of items(); track item.url) {
              <li>
                <a
                  [href]="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex min-h-16 gap-3 rounded-xl py-3 hover:bg-surface-container-low"
                >
                  <span class="min-w-0 flex-1">
                    <span class="line-clamp-3 text-sm font-medium">{{ item.headline }}</span>
                    <span class="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                      @if (item.source) {
                        <span class="truncate">{{ item.source }}</span> ·
                      }
                      <span class="shrink-0">{{ item.publishedAt | timeAgo }}</span>
                      <app-icon name="open_in_new" [size]="14" class="ml-auto shrink-0" />
                      <span class="sr-only">(opens in a new tab)</span>
                    </span>
                  </span>
                  @if (item.imageUrl && !brokenImages().has(item.url)) {
                    <img
                      [src]="item.imageUrl"
                      alt=""
                      width="64"
                      height="64"
                      loading="lazy"
                      decoding="async"
                      referrerpolicy="no-referrer"
                      class="size-16 shrink-0 rounded-lg bg-surface-container-high object-cover"
                      (error)="imageFailed(item.url)"
                    />
                  }
                </a>
              </li>
            }
          </ul>
        }
      </app-section>
    }
  `,
})
export class News {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  protected readonly expanded = persistedSignal('et.section.news', true);
  protected readonly news = this.ctx.resource(
    (symbol, options) => this.api.news(symbol, 10, options),
    () => this.expanded(),
  );
  protected readonly items = computed(() =>
    this.news.hasValue() ? (this.news.value() ?? []) : [],
  );
  protected readonly brokenImages = signal(new Set<string>());

  protected imageFailed(url: string): void {
    this.brokenImages.update((set) => new Set(set).add(url));
  }
}
