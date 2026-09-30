import { Component, computed, input } from '@angular/core';
import { StockOverview } from '../../../core/models/contract';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { CompactPipe, NumberPipe, PricePipe } from '../../../shared/pipes/format.pipes';
import { formatPlainPercent } from '../../../shared/utils/format';

/** Section 2: market cap, 52-week range with the current price, P/E, EPS (TTM), average volume. */
@Component({
  selector: 'app-key-stats',
  imports: [Skeleton, CompactPipe, PricePipe, NumberPipe],
  template: `
    <h2 class="sr-only">Key stats</h2>
    @if (overview(); as o) {
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-xs text-on-surface-variant">Market cap</dt>
          <dd class="font-medium tabular-nums">
            {{ o.keyStats.marketCap | compact: o.currency }}
            @if (o.currency !== 'USD' && o.keyStats.marketCapUsd !== null) {
              <span class="text-xs font-normal text-on-surface-variant"
                >≈ {{ o.keyStats.marketCapUsd | compact: 'USD' }}</span
              >
            }
          </dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">P/E</dt>
          <dd class="font-medium tabular-nums">{{ o.keyStats.peRatio | num: 1 }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">EPS (TTM)</dt>
          <dd class="font-medium tabular-nums">{{ o.keyStats.epsTtm | price: o.currency }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Avg volume</dt>
          <dd class="font-medium tabular-nums">{{ o.keyStats.avgVolume | compact }}</dd>
        </div>
        <div class="col-span-2">
          <dt class="text-xs text-on-surface-variant">52-week range</dt>
          <dd class="mt-1">
            <div class="flex items-center gap-2 tabular-nums">
              <span class="text-xs">{{ o.keyStats.week52Low | price: o.currency }}</span>
              <span
                class="relative h-1.5 flex-1 rounded-full bg-surface-container-highest"
                role="img"
                [attr.aria-label]="rangeLabel()"
              >
                @if (rangePosition() !== null) {
                  <span
                    class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface"
                    [style.left.%]="rangePosition()! * 100"
                  ></span>
                }
              </span>
              <span class="text-xs">{{ o.keyStats.week52High | price: o.currency }}</span>
            </div>
          </dd>
        </div>
      </dl>
    } @else {
      <div class="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-3 sm:grid-cols-3" aria-hidden="true">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="space-y-1.5">
            <app-skeleton class="h-3 w-16" />
            <app-skeleton class="h-4 w-20" />
          </div>
        }
        <div class="col-span-2 space-y-1.5">
          <app-skeleton class="h-3 w-24" />
          <app-skeleton class="h-4 w-full" />
        </div>
      </div>
    }
  `,
})
export class KeyStats {
  readonly overview = input<StockOverview | undefined>();

  /** Where today's price sits between the 52-week low (0) and high (1). */
  protected readonly rangePosition = computed(() => {
    const o = this.overview();
    const low = o?.keyStats.week52Low;
    const high = o?.keyStats.week52High;
    if (!o || low == null || high == null || high <= low) return null;
    return Math.min(1, Math.max(0, (o.quote.price - low) / (high - low)));
  });

  protected readonly rangeLabel = computed(() => {
    const position = this.rangePosition();
    return position === null
      ? '52-week range unavailable'
      : `Current price at ${formatPlainPercent(position * 100)} of the 52-week range`;
  });
}
