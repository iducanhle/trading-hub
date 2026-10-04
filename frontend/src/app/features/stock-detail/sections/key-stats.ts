import { Component, computed, input } from '@angular/core';
import { StockOverview } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { CompactPipe, NumberPipe, PricePipe } from '../../../shared/pipes/format.pipes';
import { formatPlainPercent } from '../../../shared/utils/format';

/** Section 2: market cap, 52-week range with the current price, P/E, EPS (TTM), average volume. */
@Component({
  selector: 'app-key-stats',
  imports: [TermInfo, Skeleton, CompactPipe, PricePipe, NumberPipe],
  template: `
    <h2 class="px-5 pt-9 pb-3.5 text-lg font-bold" i18n>Key stats</h2>
    @if (overview(); as o) {
      <dl class="mx-4 rounded-[22px] border border-outline-variant px-5 py-2.5">
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <dt class="app-label inline-flex items-center gap-1">
            <span i18n>Market cap</span><app-term-info term="marketCap" />
          </dt>
          <dd class="text-right text-base font-semibold">
            {{ o.keyStats.marketCap | compact: o.currency }}
            @if (o.currency !== 'USD' && o.keyStats.marketCapUsd !== null) {
              <span class="block text-xs font-semibold text-on-surface-variant"
                >≈ {{ o.keyStats.marketCapUsd | compact: 'USD' }}</span
              >
            }
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <dt class="app-label inline-flex items-center gap-1">
            <span i18n="Price to earnings ratio">P/E</span><app-term-info term="pe" />
          </dt>
          <dd class="text-base font-semibold">{{ o.keyStats.peRatio | num: 1 }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <dt class="app-label inline-flex items-center gap-1">
            <span i18n="Earnings per share, trailing 12 months"> EPS (TTM) </span
            ><app-term-info term="eps" />
          </dt>
          <dd class="text-base font-semibold">{{ o.keyStats.epsTtm | price: o.currency }}</dd>
        </div>
        <div class="flex items-baseline justify-between gap-3 py-2.5">
          <dt class="app-label inline-flex items-center gap-1">
            <span i18n>Avg volume</span><app-term-info term="avgVolume" />
          </dt>
          <dd class="text-base font-semibold">{{ o.keyStats.avgVolume | compact }}</dd>
        </div>
        <div class="pt-2.5 pb-3">
          <dt class="app-label inline-flex items-center gap-1">
            <span i18n>52-week range</span><app-term-info term="range52w" />
          </dt>
          <dd class="mt-3">
            <span
              class="relative block h-1 rounded-full bg-surface-container-high"
              role="img"
              [attr.aria-label]="rangeLabel()"
            >
              @if (rangePosition() !== null) {
                <span
                  class="absolute inset-y-0 left-0 rounded-full bg-primary"
                  [style.width.%]="rangePosition()! * 100"
                ></span>
                <span
                  class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-surface ring-[3px] ring-surface"
                  [style.left.%]="rangePosition()! * 100"
                ></span>
              }
            </span>
            <span
              class="mt-2.5 flex justify-between text-[13px] font-semibold text-on-surface-variant"
            >
              <span>{{ o.keyStats.week52Low | price: o.currency }}</span>
              <span>{{ o.keyStats.week52High | price: o.currency }}</span>
            </span>
          </dd>
        </div>
      </dl>
    } @else {
      <app-skeleton shape="card" class="mx-4 block h-64 rounded-[22px]" aria-hidden="true" />
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
      ? $localize`52-week range unavailable`
      : $localize`Current price at ${formatPlainPercent(position * 100)}:percent: of the 52-week range`;
  });
}
