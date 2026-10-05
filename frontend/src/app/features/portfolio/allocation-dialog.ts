import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { T212AllocationItem } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Dialog } from '../../shared/components/dialog/dialog';
import { PercentPipe } from '../../shared/pipes/format.pipes';
import { formatPlainPercent, toneClass } from '../../shared/utils/format';
import { displayTicker } from './portfolio-model';

export interface AllocationDialogData {
  items: T212AllocationItem[];
  /** Unrealized profit/loss in percent by `t212Ticker`, as far as loaded. */
  changes: Record<string, number>;
}

/** Opened from the treemap's "…" tile: every open position with its share; closes with the one tapped. */
@Component({
  selector: 'app-allocation-dialog',
  imports: [Dialog, StockLogo, PercentPipe],
  template: `
    <app-dialog title="All positions" i18n-title>
      <span dialogTrailing class="shrink-0 text-[15px] font-semibold text-on-surface-variant">{{
        data.items.length
      }}</span>
      <ul class="-mx-2">
        @for (item of data.items; track item.t212Ticker) {
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-container-high"
              (click)="ref.close(item)"
            >
              <app-stock-logo [symbol]="ticker(item)" [logoUrl]="item.logoUrl" [size]="40" />
              <span class="min-w-0 flex-1">
                <span class="block truncate app-row-title">{{ item.name }}</span>
                <span class="block truncate app-row-meta"
                  >{{ ticker(item) }} · {{ share(item) }}</span
                >
              </span>
              <span class="shrink-0 text-[15px] font-semibold" [class]="tone(change(item))">{{
                change(item) | pct
              }}</span>
            </button>
          </li>
        }
      </ul>
    </app-dialog>
  `,
})
export class AllocationDialog {
  protected readonly ref = inject<MatDialogRef<AllocationDialog, T212AllocationItem>>(MatDialogRef);
  protected readonly data = inject<AllocationDialogData>(MAT_DIALOG_DATA);

  protected change(item: T212AllocationItem): number | null {
    return this.data.changes[item.t212Ticker] ?? null;
  }

  protected ticker(item: T212AllocationItem): string {
    return displayTicker(item);
  }

  protected share(item: T212AllocationItem): string {
    return formatPlainPercent(item.weightPct, 1);
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }
}
