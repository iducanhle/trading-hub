import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { T212AllocationItem } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Dialog } from '../../shared/components/dialog/dialog';
import { formatPlainPercent } from '../../shared/utils/format';
import { displayTicker } from './portfolio-model';

export interface AllocationDialogData {
  items: T212AllocationItem[];
}

/** Opened from the treemap's "…" tile: every open position with its share; closes with the one tapped. */
@Component({
  selector: 'app-allocation-dialog',
  imports: [Dialog, StockLogo],
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
                <span class="block truncate app-row-meta">{{ ticker(item) }}</span>
              </span>
              <span class="shrink-0 text-[15px] font-semibold">{{ share(item) }}</span>
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

  protected ticker(item: T212AllocationItem): string {
    return displayTicker(item);
  }

  protected share(item: T212AllocationItem): string {
    return formatPlainPercent(item.weightPct, 1);
  }
}
