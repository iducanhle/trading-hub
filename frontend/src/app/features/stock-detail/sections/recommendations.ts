import { Component, computed, inject } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { RecommendationPeriod } from '../../../core/models/contract';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { formatDate } from '../../../shared/utils/dates';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

const SCALE = [
  { key: 'strongBuy', label: 'Strong buy', color: 'var(--app-rec-strong-buy)', text: '#fff' },
  { key: 'buy', label: 'Buy', color: 'var(--app-rec-buy)', text: '#10230f' },
  { key: 'hold', label: 'Hold', color: 'var(--app-rec-hold)', text: '#2a2000' },
  { key: 'sell', label: 'Sell', color: 'var(--app-rec-sell)', text: '#2b1100' },
  { key: 'strongSell', label: 'Strong sell', color: 'var(--app-rec-strong-sell)', text: '#fff' },
] as const;

interface Bar {
  period: string;
  label: string;
  total: number;
  description: string;
  segments: { label: string; count: number; percent: number; color: string; text: string }[];
}

export function recommendationBars(periods: RecommendationPeriod[]): Bar[] {
  return periods.map((p) => {
    const total = SCALE.reduce((sum, s) => sum + p[s.key], 0);
    const segments = SCALE.map((s) => ({
      label: s.label,
      count: p[s.key],
      percent: total ? (p[s.key] / total) * 100 : 0,
      color: s.color,
      text: s.text,
    }));
    const label = formatDate(`${p.period}-01`, 'monthYear');
    return {
      period: p.period,
      label,
      total,
      segments,
      description: `${label}: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')}`,
    };
  });
}

/** Section 10: analyst recommendations per month as stacked bars (hidden when there are none). */
@Component({
  selector: 'app-recommendations',
  imports: [Section, ErrorState, Skeleton],
  template: `
    @if (!recs.hasValue() || bars().length) {
      <app-section title="Analyst recommendations" [(expanded)]="expanded">
        @if (recs.error()) {
          <app-error-state compact [error]="recs.error()" (retry)="recs.reload()" />
        } @else if (!recs.hasValue()) {
          <div class="space-y-3" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <app-skeleton class="h-6 w-full" />
            }
          </div>
        } @else {
          <ul class="space-y-2.5">
            @for (bar of bars(); track bar.period) {
              <li class="flex items-center gap-3 text-sm">
                <span class="w-16 shrink-0 text-xs text-on-surface-variant">{{ bar.label }}</span>
                <span class="flex h-6 flex-1 overflow-hidden rounded-md" role="img" [attr.aria-label]="bar.description">
                  @for (s of bar.segments; track s.label) {
                    @if (s.count) {
                      <span
                        class="flex items-center justify-center text-[11px] font-semibold tabular-nums"
                        [style.width.%]="s.percent"
                        [style.background]="s.color"
                        [style.color]="s.text"
                        >{{ s.percent >= 9 ? s.count : '' }}</span
                      >
                    }
                  }
                </span>
                <span class="w-7 shrink-0 text-right text-xs text-on-surface-variant tabular-nums">{{ bar.total }}</span>
              </li>
            }
          </ul>
          <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant" aria-label="Legend">
            @for (s of scale; track s.key) {
              <li class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-sm" [style.background]="s.color"></span>{{ s.label }}
              </li>
            }
          </ul>
        }
      </app-section>
    }
  `,
})
export class Recommendations {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  protected readonly scale = SCALE;
  protected readonly expanded = persistedSignal('et.section.recommendations', true);
  protected readonly recs = this.ctx.resource(
    (symbol, options) => this.api.recommendations(symbol, options),
    () => this.expanded(),
  );
  protected readonly bars = computed(() => recommendationBars(this.recs.hasValue() ? (this.recs.value() ?? []) : []));
}
