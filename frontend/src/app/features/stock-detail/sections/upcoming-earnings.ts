import { Component, input } from '@angular/core';
import { EarningsEvent } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { StatList, StatRow } from '../../../shared/components/stat-list/stat-list';
import {
  AppDatePipe,
  CompactPipe,
  PricePipe,
  RelativeDayPipe,
  ReportTimePipe,
} from '../../../shared/pipes/format.pipes';
import { fiscalLabel } from '../../../shared/utils/format';

/** Section 6: the next report (from the overview): date, countdown, time, fiscal quarter, EPS and revenue estimates. */
@Component({
  selector: 'app-upcoming-earnings',
  imports: [
    TermInfo,
    Skeleton,
    StatList,
    StatRow,
    AppDatePipe,
    RelativeDayPipe,
    ReportTimePipe,
    PricePipe,
    CompactPipe,
  ],
  template: `
    <section class="mx-4 mt-5" aria-labelledby="upcoming-title">
      @if (loading()) {
        <app-skeleton shape="card" class="block h-44 rounded-[22px]" />
      } @else if (event(); as e) {
        <div class="app-card">
          <div class="flex items-center justify-between gap-3">
            <h2 id="upcoming-title" class="app-label inline-flex items-center gap-1">
              <ng-container i18n>Upcoming earnings</ng-container><app-term-info term="earnings" />
            </h2>
            <span class="shrink-0 app-pill bg-primary text-on-primary">{{
              e.date | relativeDay
            }}</span>
          </div>
          <p class="mt-2 text-[22px] font-semibold">{{ e.date | appDate: 'long' }}</p>
          <p class="mt-0.5 text-sm font-semibold text-on-surface-variant">
            {{ e.time | reportTime }} <app-term-info term="reportTime" />
            @if (fiscal(e); as label) {
              · {{ label }}
            }
          </p>
          <dl appStatList class="mt-3.5 border-t border-outline-variant pt-1">
            <div appStatRow label="EPS estimate" i18n-label term="epsEstimate">
              {{ e.epsEstimate | price: e.currency }}
            </div>
            <div appStatRow label="Revenue estimate" i18n-label term="revenueEstimate">
              {{ e.revenueEstimate | compact: e.currency }}
            </div>
          </dl>
        </div>
      } @else {
        <div class="app-card">
          <h2 id="upcoming-title" class="app-label" i18n>Upcoming earnings</h2>
          <p class="mt-2 text-sm text-on-surface-variant" i18n>No upcoming date announced.</p>
        </div>
      }
    </section>
  `,
})
export class UpcomingEarnings {
  readonly event = input<EarningsEvent | null | undefined>();
  readonly loading = input(false);

  protected fiscal(e: EarningsEvent): string | null {
    return fiscalLabel(e.fiscalQuarter, e.fiscalYear);
  }
}
