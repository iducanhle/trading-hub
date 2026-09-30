import { Component, computed, input } from '@angular/core';
import { Performance } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Change } from '../../../shared/components/change/change';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { PERIOD_LABELS } from '../../../shared/utils/format';

/** Section 3: 1W, 1M, YTD and 1Y performance chips. */
@Component({
  selector: 'app-performance-summary',
  imports: [TermInfo, Change, Skeleton],
  template: `
    <h2 class="sr-only" i18n>Performance</h2>
    <ul
      class="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3"
      tabindex="0"
      aria-label="Performance"
      i18n-aria-label
    >
      @for (item of items(); track item.label) {
        <li
          class="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-outline-variant px-3 text-sm"
        >
          <span class="text-on-surface-variant">{{ item.label }}</span>
          @if (performance()) {
            <app-change [value]="item.value" class="font-medium" />
          } @else {
            <app-skeleton class="h-4 w-12" />
          }
        </li>
      }
      <li class="flex shrink-0 items-center px-2"><app-term-info term="performance" /></li>
    </ul>
  `,
})
export class PerformanceSummary {
  readonly performance = input<Performance | undefined>();

  protected readonly items = computed(() => {
    const p = this.performance();
    return [
      { label: PERIOD_LABELS['1W'], value: p?.w1 },
      { label: PERIOD_LABELS['1M'], value: p?.m1 },
      { label: PERIOD_LABELS.YTD, value: p?.ytd },
      { label: PERIOD_LABELS['1Y'], value: p?.y1 },
    ];
  });
}
