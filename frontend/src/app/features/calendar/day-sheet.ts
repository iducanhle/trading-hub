import { Component, computed, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { Router } from '@angular/router';
import { CalendarDay } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import {
  AppDatePipe,
  CompactPipe,
  PricePipe,
  ReportTimePipe,
} from '../../shared/pipes/format.pipes';
import { groupByTime, reportCount } from './calendar-model';
import { Sheet } from '../../shared/components/sheet/sheet';

export interface DaySheetData {
  day: CalendarDay;
  followed: ReadonlySet<string>;
}

/** Bottom sheet with every report of a day, grouped by report time. */
@Component({
  selector: 'app-day-sheet',
  imports: [Sheet, StockLogo, AppDatePipe, CompactPipe, PricePipe, ReportTimePipe],
  template: `
    <app-sheet>
      <div class="flex items-baseline justify-between gap-3 pb-2">
        <h2 class="text-[22px] leading-tight font-bold">{{ data.day.date | appDate: 'long' }}</h2>
        <span class="shrink-0 text-sm font-semibold text-on-surface-variant">{{ count() }}</span>
      </div>
      @for (group of groups(); track group.time) {
        <h3 class="pt-4 pb-1 text-xs font-bold tracking-[.05em] text-on-surface-variant uppercase">
          {{ group.time | reportTime }}
        </h3>
        <ul class="-mx-4">
          @for (e of group.events; track e.symbol) {
            <li>
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-container-high"
                (click)="open(e.symbol)"
              >
                <app-stock-logo
                  [symbol]="e.symbol"
                  [logoUrl]="e.logoUrl"
                  [size]="36"
                  [followed]="data.followed.has(e.symbol)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold">{{ e.symbol }}</span>
                  <span class="block truncate text-sm text-on-surface-variant">{{ e.name }}</span>
                </span>
                <span class="shrink-0 text-right text-xs text-on-surface-variant tabular-nums">
                  <span class="block" i18n>EPS est. {{ e.epsEstimate | price: e.currency }}</span>
                  <span class="block">{{ e.marketCapUsd | compact: 'USD' }}</span>
                </span>
              </button>
            </li>
          }
        </ul>
      } @empty {
        <p class="py-6 text-sm text-on-surface-variant" i18n>No reports on this day.</p>
      }
    </app-sheet>
  `,
})
export class DaySheet {
  protected readonly data = inject<DaySheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<DaySheet>);
  private readonly router = inject(Router);

  protected readonly groups = computed(() => groupByTime(this.data.day.events));
  protected readonly count = computed(() => reportCount(this.data.day.events.length));

  protected open(symbol: string): void {
    this.ref.dismiss();
    void this.router.navigate(['/stock', symbol]);
  }
}
