import { Component, computed, input } from '@angular/core';
import { EarningsStats as Stats } from '../../../core/models/contract';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { formatNumber, formatPlainPercent } from '../../../shared/utils/format';
import { persistedSignal } from '../../../shared/utils/persisted-signal';

/** "6 of 8 quarters · 75%", or null without data. */
export function beatRateText(stats: Stats): string | null {
  if (stats.beatRate == null || !stats.quartersAnalyzed) return null;
  const beats = Math.round((stats.beatRate / 100) * stats.quartersAnalyzed);
  return `${beats} of ${stats.quartersAnalyzed} quarters · ${formatPlainPercent(stats.beatRate)}`;
}

/** Section 9: beat rate, current streak and average absolute reaction (from the overview). */
@Component({
  selector: 'app-earnings-stats',
  imports: [Section, Skeleton],
  template: `
    <app-section title="Earnings stats" [(expanded)]="expanded">
      @if (stats(); as s) {
        <dl
          class="divide-y divide-outline-variant/60 rounded-2xl bg-surface-container-low sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          <div class="flex items-center justify-between gap-3 px-4 py-3 sm:block">
            <dt class="text-xs text-on-surface-variant">Beat rate</dt>
            <dd class="text-right font-semibold sm:mt-1 sm:text-left">{{ beatRate() ?? '—' }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-3 sm:block">
            <dt class="text-xs text-on-surface-variant">Current streak</dt>
            <dd class="font-semibold sm:mt-1">
              @if (s.streak; as streak) {
                <span
                  [class.text-gain]="streak.result === 'BEAT'"
                  [class.text-loss]="streak.result === 'MISS'"
                  >{{ streak.count }}× {{ streak.result }}</span
                >
              } @else {
                —
              }
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-3 sm:block">
            <dt class="text-xs text-on-surface-variant">Avg. reaction (absolute)</dt>
            <dd class="font-semibold tabular-nums sm:mt-1">{{ avgReaction() }}</dd>
          </div>
        </dl>
      } @else {
        <app-skeleton shape="card" class="h-36 sm:h-20" />
      }
    </app-section>
  `,
})
export class EarningsStats {
  readonly stats = input<Stats | undefined>();
  protected readonly expanded = persistedSignal('et.section.stats', true);

  protected readonly beatRate = computed(() => {
    const stats = this.stats();
    return stats ? beatRateText(stats) : null;
  });
  protected readonly avgReaction = computed(() => {
    const value = this.stats()?.avgAbsReactionPercent;
    return value == null ? '—' : `±${formatNumber(value, 1)}%`;
  });
}
