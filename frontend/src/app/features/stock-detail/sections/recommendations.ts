import { Component, computed, inject } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { RecommendationPeriod } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { formatDate } from '../../../shared/utils/dates';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

const SCALE = [
  {
    key: 'strongBuy',
    label: $localize`:Analyst rating:Strong buy`,
    color: 'var(--app-rec-strong-buy)',
    text: 'light-dark(#fff, #05210b)',
  },
  {
    key: 'buy',
    label: $localize`:Analyst rating:Buy`,
    color: 'var(--app-rec-buy)',
    text: 'var(--mat-sys-on-surface)',
  },
  {
    key: 'hold',
    label: $localize`:Analyst rating:Hold`,
    color: 'var(--app-rec-hold)',
    text: '#1a1404',
  },
  {
    key: 'sell',
    label: $localize`:Analyst rating:Sell`,
    color: 'var(--app-rec-sell)',
    text: '#2b1100',
  },
  {
    key: 'strongSell',
    label: $localize`:Analyst rating:Strong sell`,
    color: 'var(--app-rec-strong-sell)',
    text: 'light-dark(#fff, #2a0606)',
  },
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

/**
 * The majority view of one month: buy (strong buy + buy), hold or sell (sell + strong sell), with how many analysts
 * hold it. A tie goes to hold. Null without any analysts.
 */
export function recommendationConsensus(p: RecommendationPeriod) {
  const buy = p.strongBuy + p.buy;
  const sell = p.sell + p.strongSell;
  const total = buy + p.hold + sell;
  if (!total) return null;
  const month = formatDate(`${p.period}-01`, 'monthYear');
  if (buy > p.hold && buy > sell)
    return { label: SCALE[1].label, tone: 'text-gain', count: buy, total, month };
  if (sell > p.hold && sell > buy)
    return { label: SCALE[3].label, tone: 'text-loss', count: sell, total, month };
  return { label: SCALE[2].label, tone: 'text-on-surface', count: p.hold, total, month };
}

/** Section 10: analyst recommendations per month as stacked bars (hidden when there are none). */
@Component({
  selector: 'app-recommendations',
  imports: [TermInfo, Section, ErrorState, Skeleton],
  template: `
    @if (!recs.hasValue() || bars().length) {
      <app-section title="Analyst recommendations" i18n-title [(expanded)]="expanded">
        @if (recs.error()) {
          <app-error-state compact [error]="recs.error()" (retry)="recs.reload()" />
        } @else if (!recs.hasValue()) {
          <div class="space-y-3" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <app-skeleton class="h-6 w-full" />
            }
          </div>
        } @else {
          <div class="app-card">
            @if (consensus(); as c) {
              <p class="flex flex-wrap items-baseline gap-x-2.5">
                <span class="text-[26px] font-bold" [class]="c.tone">{{ c.label }}</span>
                <span class="text-sm font-semibold text-on-surface-variant" i18n
                  >{{ c.count }} of {{ c.total }} analysts · {{ c.month }}</span
                >
              </p>
            }
            <ul class="mt-4 space-y-3">
              @for (bar of bars(); track bar.period) {
                <li class="flex items-center gap-2.5 text-sm">
                  <span
                    class="w-[74px] shrink-0 text-[13px] font-semibold text-on-surface-variant"
                    >{{ bar.label }}</span
                  >
                  <span
                    class="flex h-[26px] flex-1 gap-0.5 overflow-hidden rounded-lg"
                    role="img"
                    [attr.aria-label]="bar.description"
                  >
                    @for (s of bar.segments; track s.label) {
                      @if (s.count) {
                        <span
                          class="flex items-center justify-center text-xs font-extrabold"
                          [style.width.%]="s.percent"
                          [style.background]="s.color"
                          [style.color]="s.text"
                          >{{ s.percent >= 9 ? s.count : '' }}</span
                        >
                      }
                    }
                  </span>
                  <span class="w-6 shrink-0 text-right text-[13px] font-bold">{{ bar.total }}</span>
                </li>
              }
            </ul>
            <ul
              class="mt-4 flex flex-wrap gap-x-3.5 gap-y-2 text-[12.5px] font-semibold text-on-surface-variant"
              aria-label="Legend"
              i18n-aria-label="Chart legend"
            >
              @for (s of scale; track s.key) {
                <li class="flex items-center gap-1.5">
                  <span class="size-2.5 rounded-[3px]" [style.background]="s.color"></span
                  >{{ s.label }}
                </li>
              }
              <li class="flex items-center"><app-term-info term="recommendations" /></li>
            </ul>
          </div>
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
  protected readonly bars = computed(() =>
    recommendationBars(this.recs.hasValue() ? (this.recs.value() ?? []) : []),
  );
  /** The newest month's majority: buy (strong buy + buy), hold or sell (sell + strong sell). */
  protected readonly consensus = computed(() => {
    const latest = this.recs.hasValue() ? this.recs.value()?.[0] : undefined;
    return latest ? recommendationConsensus(latest) : null;
  });
}
