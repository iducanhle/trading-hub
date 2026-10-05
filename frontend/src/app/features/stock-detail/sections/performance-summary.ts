import { Component, computed, input } from '@angular/core';
import { Performance } from '../../../core/models/contract';
import { Change } from '../../../shared/components/change/change';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { PERIOD_LABELS } from '../../../shared/utils/format';

/** Section 3: 1W, 1M, YTD and 1Y performance chips. */
@Component({
  selector: 'app-performance-summary',
  imports: [Change, Skeleton],
  template: `
    <h2 class="sr-only" i18n>Performance</h2>
    <ul class="grid grid-cols-4 gap-1.5 px-4" aria-label="Performance" i18n-aria-label>
      @for (item of items(); track item.label) {
        <li class="min-w-0 rounded-xl bg-surface-container px-2 py-2">
          <span class="app-label block truncate text-[10px]">{{ item.label }}</span>
          @if (performance()) {
            <app-change [value]="item.value" class="mt-0.5 block truncate text-[13px] font-bold" />
          } @else {
            <app-skeleton class="mt-1 h-4 w-12" />
          }
        </li>
      }
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
