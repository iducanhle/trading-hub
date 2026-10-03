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
      class="no-scrollbar mt-3.5 flex gap-2.5 overflow-x-auto px-4"
      tabindex="0"
      aria-label="Performance"
      i18n-aria-label
    >
      @for (item of items(); track item.label) {
        <li class="min-w-[104px] flex-1 shrink-0 rounded-2xl bg-surface-container px-3.5 py-3">
          <span class="app-label block text-[11px]">{{ item.label }}</span>
          @if (performance()) {
            <app-change [value]="item.value" class="mt-1 block text-base font-bold" />
          } @else {
            <app-skeleton class="mt-1.5 h-5 w-14" />
          }
        </li>
      }
      <li class="flex shrink-0 items-center px-1"><app-term-info term="performance" /></li>
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
