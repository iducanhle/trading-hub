import { Component, computed, input } from '@angular/core';
import { EarningsEvent, EarningsStats as Stats } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { AppDatePipe, RelativeDayPipe } from '../../../shared/pipes/format.pipes';
import {
  PERCENT_SIGN,
  formatNumber,
  formatPlainPercent,
  resultLabel,
} from '../../../shared/utils/format';

/** "6 of 8 quarters · 75%", or null without data. */
export function beatRateText(stats: Stats): string | null {
  if (stats.beatRate == null || !stats.quartersAnalyzed) return null;
  const beats = Math.round((stats.beatRate / 100) * stats.quartersAnalyzed);
  const quarters = stats.quartersAnalyzed;
  const rate = formatPlainPercent(stats.beatRate);
  return quarters === 1
    ? $localize`${beats}:beats: of ${quarters}:quarters: quarter · ${rate}:rate:`
    : $localize`${beats}:beats: of ${quarters}:quarters: quarters · ${rate}:rate:`;
}

/**
 * Under the analyst recommendations: the next report's date and countdown, beat rate, current streak and average
 * absolute reaction (from the overview).
 */
@Component({
  selector: 'app-earnings-stats',
  imports: [TermInfo, Skeleton, AppDatePipe, RelativeDayPipe],
  template: `
    <div class="mx-4">
      @if (stats(); as s) {
        <dl
          class="divide-y divide-outline-variant rounded-[22px] border border-outline-variant px-5 py-1.5"
        >
          <div class="flex items-center justify-between gap-3 py-3">
            <dt class="app-label inline-flex items-center gap-1">
              <span i18n>Upcoming earnings</span><app-term-info term="earnings" />
            </dt>
            <dd class="text-right text-[15px] font-semibold">
              @if (nextEarnings(); as e) {
                <span class="block whitespace-nowrap">{{ e.date | appDate }}</span>
                <span class="block text-[13px] whitespace-nowrap text-on-surface-variant">{{
                  e.date | relativeDay
                }}</span>
              } @else {
                —
              }
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-3">
            <dt class="app-label inline-flex items-center gap-1">
              <span i18n>Beat rate</span><app-term-info term="beatRate" />
            </dt>
            <dd class="text-right text-[15px] font-semibold">{{ beatRate() ?? '—' }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-3">
            <dt class="app-label inline-flex items-center gap-1">
              <span i18n>Current streak</span><app-term-info term="streak" />
            </dt>
            <dd class="text-right text-[15px] font-semibold">
              @if (s.streak; as streak) {
                <span
                  [class.text-gain]="streak.result === 'BEAT'"
                  [class.text-loss]="streak.result === 'MISS'"
                  >{{ streak.count }}× {{ result(streak.result) }}</span
                >
              } @else {
                —
              }
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-3">
            <dt class="app-label inline-flex items-center gap-1">
              <span i18n>Avg. reaction (absolute)</span><app-term-info term="avgReaction" />
            </dt>
            <dd class="text-right text-[15px] font-semibold">{{ avgReaction() }}</dd>
          </div>
        </dl>
      } @else {
        <app-skeleton shape="card" class="block h-40 rounded-[22px]" />
      }
    </div>
  `,
})
export class EarningsStats {
  readonly stats = input<Stats | undefined>();
  /** The next report (from the overview); null when no date is announced. */
  readonly nextEarnings = input<EarningsEvent | null | undefined>();

  protected readonly beatRate = computed(() => {
    const stats = this.stats();
    return stats ? beatRateText(stats) : null;
  });
  protected readonly avgReaction = computed(() => {
    const value = this.stats()?.avgAbsReactionPercent;
    return value == null ? '—' : `±${formatNumber(value, 1)}${PERCENT_SIGN}`;
  });
  protected readonly result = resultLabel;
}
