import { Component, input } from '@angular/core';
import { EarningsEvent } from '../../../core/models/contract';
import { TermInfo } from '../../../shared/components/term-info/term-info';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
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
          <dl class="mt-4 grid grid-cols-2 gap-3">
            <div class="rounded-[14px] bg-surface-container-high px-3.5 py-3">
              <dt class="app-label inline-flex items-center gap-1 text-[11px]">
                <span i18n>EPS estimate</span><app-term-info term="epsEstimate" />
              </dt>
              <dd class="mt-1 text-base font-semibold">{{ e.epsEstimate | price: e.currency }}</dd>
            </div>
            <div class="rounded-[14px] bg-surface-container-high px-3.5 py-3">
              <dt class="app-label inline-flex items-center gap-1 text-[11px]">
                <span i18n>Revenue estimate</span><app-term-info term="revenueEstimate" />
              </dt>
              <dd class="mt-1 text-base font-semibold">
                {{ e.revenueEstimate | compact: e.currency }}
              </dd>
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
