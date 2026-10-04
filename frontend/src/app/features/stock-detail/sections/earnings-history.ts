import { Component, computed, inject } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { EarningsQuarter } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Change } from '../../../shared/components/change/change';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { ResultBadge } from '../../../shared/components/result-badge/result-badge';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../../shared/components/stale-chip/stale-chip';
import {
  AppDatePipe,
  CompactPipe,
  PricePipe,
  ReportTimePipe,
} from '../../../shared/pipes/format.pipes';
import { formatDate } from '../../../shared/utils/dates';
import { fiscalLabel } from '../../../shared/utils/format';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

/**
 * Sections 7 + 8: the last 12 reported quarters with EPS and revenue (estimate → actual, surprise), the result, and
 * the price reaction (5-day run-up, gap, reaction day, 5-day drift). One card per quarter on phones; a table from `md`.
 */
@Component({
  selector: 'app-earnings-history',
  imports: [
    TermInfo,
    Section,
    Change,
    ErrorState,
    ResultBadge,
    Skeleton,
    StaleChip,
    AppDatePipe,
    CompactPipe,
    PricePipe,
    ReportTimePipe,
  ],
  template: `
    <app-section title="Earnings history" i18n-title [(expanded)]="expanded">
      @if (earnings.error() && !earnings.hasValue()) {
        <app-error-state compact [error]="earnings.error()" (retry)="earnings.reload()" />
      } @else if (!earnings.hasValue()) {
        <div class="space-y-3" aria-hidden="true">
          @for (i of [1, 2, 3]; track i) {
            <app-skeleton shape="card" class="h-36" />
          }
        </div>
      } @else if (!quarters().length) {
        <p class="text-sm text-on-surface-variant" i18n>No reported quarters yet.</p>
      } @else {
        @if (earnings.value()!.stale) {
          <app-stale-chip class="mb-3 block" [asOf]="earnings.value()!.asOf" />
        }
        <!-- Phones: one card per quarter, results on top and the price reaction below. -->
        <ul class="space-y-3 md:hidden">
          @for (q of quarters(); track q.date) {
            <li class="app-card text-sm">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-base font-bold">{{ label(q) }}</p>
                  <p class="mt-0.5 text-[13px] font-semibold text-on-surface-variant">
                    {{ q.date | appDate: 'medium' }} · {{ q.time | reportTime }}
                    @if (q.timeAssumed) {
                      <span class="italic" i18n="The report time is a guess">(assumed)</span>
                    }
                  </p>
                </div>
                <span class="flex items-center gap-1">
                  <app-result-badge [result]="q.result" />
                </span>
              </div>
              <dl class="mt-3 space-y-1.5 text-[15px] font-semibold">
                <div class="flex items-baseline justify-between gap-2">
                  <dt class="app-label" i18n="Earnings per share">EPS</dt>
                  <dd class="text-right">
                    {{ q.eps.estimate | price: q.currency }} →
                    <span class="font-medium">{{ q.eps.actual | price: q.currency }}</span>
                    <app-change class="ml-1 text-xs" [value]="q.eps.surprisePercent" />
                  </dd>
                </div>
                <div class="flex items-baseline justify-between gap-2">
                  <dt class="app-label" i18n>Revenue</dt>
                  <dd class="text-right">
                    {{ q.revenue.estimate | compact: q.currency }} →
                    <span class="font-medium">{{ q.revenue.actual | compact: q.currency }}</span>
                    <app-change class="ml-1 text-xs" [value]="q.revenue.surprisePercent" />
                  </dd>
                </div>
              </dl>
              <div class="mt-3">
                <p class="app-label mb-2 flex items-center gap-1">
                  <span i18n>Price reaction</span><app-term-info term="reaction" />
                </p>
                <dl class="grid grid-cols-4 gap-1.5 text-center">
                  @for (cell of reaction(q); track cell.label) {
                    <div class="rounded-xl bg-surface-container-high px-1 py-2.5">
                      <dt class="app-label text-[11px] tracking-[.04em]">{{ cell.label }}</dt>
                      <dd class="mt-0.5 text-sm font-bold">
                        <app-change [value]="cell.value" [digits]="1" />
                      </dd>
                    </div>
                  }
                </dl>
              </div>
            </li>
          }
        </ul>

        <!-- Desktop: a table with the reaction as extra columns. -->
        <div class="hidden overflow-x-auto md:block">
          <table class="w-full text-sm tabular-nums">
            <caption class="sr-only" i18n>
              Earnings history and price reaction by quarter
            </caption>
            <thead class="text-left text-xs text-on-surface-variant">
              <tr class="border-b border-outline-variant">
                <th scope="col" class="py-2 pr-3 font-medium" i18n>Quarter</th>
                <th scope="col" class="px-2 py-2 text-right font-medium" i18n>EPS est. → act.</th>
                <th scope="col" class="px-2 py-2 text-right font-medium">
                  <span class="inline-flex items-center gap-1"
                    ><span i18n>Surprise</span><app-term-info term="surprise"
                  /></span>
                </th>
                <th scope="col" class="px-2 py-2 text-right font-medium" i18n>
                  Revenue est. → act.
                </th>
                <th scope="col" class="px-2 py-2 text-right font-medium" i18n>Surprise</th>
                <th scope="col" class="px-2 py-2 font-medium">
                  <span class="inline-flex items-center gap-1"
                    ><span i18n>Result</span><app-term-info term="result"
                  /></span>
                </th>
                <th
                  scope="col"
                  class="px-2 py-2 text-right font-medium"
                  title="5 sessions before the report"
                  i18n-title
                >
                  <span class="inline-flex items-center gap-1"
                    ><app-term-info term="reaction" />{{ reactionLabels.runUp }}</span
                  >
                </th>
                <th scope="col" class="px-2 py-2 text-right font-medium">
                  {{ reactionLabels.gap }}
                </th>
                <th scope="col" class="px-2 py-2 text-right font-medium">
                  {{ reactionLabels.day }}
                </th>
                <th
                  scope="col"
                  class="py-2 pl-2 text-right font-medium"
                  title="5 sessions after the reaction day"
                  i18n-title
                >
                  {{ reactionLabels.drift }}
                </th>
              </tr>
            </thead>
            <tbody>
              @for (q of quarters(); track q.date) {
                <tr class="border-b border-outline-variant/60">
                  <th scope="row" class="py-2 pr-3 text-left font-normal">
                    <span class="block font-medium">{{ label(q) }}</span>
                    <span class="text-xs text-on-surface-variant">
                      {{ q.date | appDate: 'medium' }} · {{ q.time | reportTime }}
                      @if (q.timeAssumed) {
                        <span class="italic" i18n="The report time is a guess">(assumed)</span>
                      }
                    </span>
                  </th>
                  <td class="px-2 py-2 text-right whitespace-nowrap">
                    {{ q.eps.estimate | price: q.currency }} →
                    {{ q.eps.actual | price: q.currency }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    <app-change [value]="q.eps.surprisePercent" />
                  </td>
                  <td class="px-2 py-2 text-right whitespace-nowrap">
                    {{ q.revenue.estimate | compact: q.currency }} →
                    {{ q.revenue.actual | compact: q.currency }}
                  </td>
                  <td class="px-2 py-2 text-right">
                    <app-change [value]="q.revenue.surprisePercent" />
                  </td>
                  <td class="px-2 py-2"><app-result-badge [result]="q.result" /></td>
                  @for (cell of reaction(q); track cell.label) {
                    <td class="px-2 py-2 text-right last:pr-0">
                      <app-change [value]="cell.value" [digits]="1" />
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </app-section>
  `,
})
export class EarningsHistory {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  protected readonly expanded = persistedSignal('et.section.earnings', true);
  protected readonly earnings = this.ctx.resource(
    (symbol, options) => this.api.earnings(symbol, options),
    () => this.expanded(),
  );
  protected readonly quarters = computed(() =>
    this.earnings.hasValue() ? (this.earnings.value()?.quarters ?? []) : [],
  );

  /** Price reaction around a report: the 5 sessions before, the opening gap, the reaction day, 5 sessions after. */
  protected readonly reactionLabels = {
    runUp: $localize`:Price change in the 5 sessions before the report:Run-up`,
    gap: $localize`:Opening price gap on the reaction day:Gap`,
    day: $localize`:Price change on the reaction day:Day`,
    drift: $localize`:Price change in the 5 sessions after the reaction day:Drift`,
  };

  protected label(q: EarningsQuarter): string {
    // Sources without a fiscal period: name the report by its month.
    // Sources without a fiscal period: name the report by its month.
    return (
      fiscalLabel(q.fiscalQuarter, q.fiscalYear) ??
      $localize`${formatDate(q.date, 'monthYear')}:month: report`
    );
  }

  protected reaction(q: EarningsQuarter): { label: string; value: number | null }[] {
    const r = q.reaction;
    return [
      { label: this.reactionLabels.runUp, value: r?.preRunUpPercent ?? null },
      { label: this.reactionLabels.gap, value: r?.gapPercent ?? null },
      { label: this.reactionLabels.day, value: r?.reactionDayPercent ?? null },
      { label: this.reactionLabels.drift, value: r?.driftPercent ?? null },
    ];
  }
}
