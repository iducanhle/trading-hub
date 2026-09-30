import { Component, input } from '@angular/core';
import { EarningsEvent } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { Icon } from '../../../shared/icon/icon';
import {
  AppDatePipe,
  CompactPipe,
  PricePipe,
  RelativeDayPipe,
  ReportTimePipe,
} from '../../../shared/pipes/format.pipes';
import { fiscalLabel } from '../../../shared/utils/format';
import { persistedSignal } from '../../../shared/utils/persisted-signal';

/** Section 6: the next report (from the overview): date, countdown, time, fiscal quarter, EPS and revenue estimates. */
@Component({
  selector: 'app-upcoming-earnings',
  imports: [
    TermInfo,
    Section,
    Skeleton,
    Icon,
    AppDatePipe,
    RelativeDayPipe,
    ReportTimePipe,
    PricePipe,
    CompactPipe,
  ],
  template: `
    <app-section title="Upcoming earnings" i18n-title [(expanded)]="expanded">
      @if (loading()) {
        <app-skeleton shape="card" class="h-28" />
      } @else if (event(); as e) {
        <div class="rounded-2xl bg-primary-container/60 p-4 text-on-primary-container">
          <div class="flex items-start gap-3">
            <span
              class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface text-primary"
            >
              <app-icon name="event" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-1.5 text-lg font-semibold">
                {{ e.date | appDate: 'long' }}<app-term-info term="earnings" />
              </p>
              <p class="text-sm">
                <span class="font-medium">{{ e.date | relativeDay }}</span> ·
                {{ e.time | reportTime }} <app-term-info term="reportTime" />
                @if (fiscal(e); as label) {
                  · {{ label }}
                }
              </p>
            </div>
          </div>
          <dl class="mt-3 grid grid-cols-2 gap-3 text-sm tabular-nums">
            <div>
              <dt class="flex items-center gap-1 text-xs">
                <span class="opacity-80" i18n>EPS estimate</span
                ><app-term-info term="epsEstimate" />
              </dt>
              <dd class="font-semibold">{{ e.epsEstimate | price: e.currency }}</dd>
            </div>
            <div>
              <dt class="flex items-center gap-1 text-xs">
                <span class="opacity-80" i18n>Revenue estimate</span
                ><app-term-info term="revenueEstimate" />
              </dt>
              <dd class="font-semibold">{{ e.revenueEstimate | compact: e.currency }}</dd>
            </div>
          </dl>
        </div>
      } @else {
        <p class="rounded-2xl bg-surface-container-low p-4 text-sm text-on-surface-variant" i18n>
          No upcoming date announced.
        </p>
      }
    </app-section>
  `,
})
export class UpcomingEarnings {
  readonly event = input<EarningsEvent | null | undefined>();
  readonly loading = input(false);
  protected readonly expanded = persistedSignal('et.section.upcoming', true);

  protected fiscal(e: EarningsEvent): string | null {
    return fiscalLabel(e.fiscalQuarter, e.fiscalYear);
  }
}
