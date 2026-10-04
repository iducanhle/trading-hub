import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
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
import { Dialog } from '../../shared/components/dialog/dialog';

export interface DaySheetData {
  day: CalendarDay;
  followed: ReadonlySet<string>;
}

/** Dialog with every report of a day, grouped by report time. */
@Component({
  selector: 'app-day-sheet',
  imports: [Dialog, StockLogo, AppDatePipe, CompactPipe, PricePipe, ReportTimePipe],
  template: `
    <app-dialog [title]="data.day.date | appDate: 'long'">
      <span dialogTrailing class="shrink-0 text-sm font-semibold text-on-surface-variant">{{
        count()
      }}</span>
      @for (group of groups(); track group.time) {
        <h3 class="pt-3 pb-1 app-title-card first-of-type:pt-0">
          {{ group.time | reportTime }}
        </h3>
        <ul class="-mx-4">
          @for (e of group.events; track e.symbol) {
            <li>
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5 text-left hover:bg-surface-container-high"
                (click)="open(e.symbol)"
              >
                <app-stock-logo
                  [symbol]="e.symbol"
                  [logoUrl]="e.logoUrl"
                  [size]="40"
                  [followed]="data.followed.has(e.symbol)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block app-row-title">{{ e.symbol }}</span>
                  <span class="block truncate app-row-meta">{{ e.name }}</span>
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
    </app-dialog>
  `,
})
export class DaySheet {
  protected readonly data = inject<DaySheetData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DaySheet>);
  private readonly router = inject(Router);

  protected readonly groups = computed(() => groupByTime(this.data.day.events));
  protected readonly count = computed(() => reportCount(this.data.day.events.length));

  protected open(symbol: string): void {
    this.ref.close();
    void this.router.navigate(['/stock', symbol]);
  }
}
