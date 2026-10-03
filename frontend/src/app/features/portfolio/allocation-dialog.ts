import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { T212AllocationItem } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { PercentPipe } from '../../shared/pipes/format.pipes';
import { formatPlainPercent, toneClass } from '../../shared/utils/format';
import { displayTicker } from './portfolio-model';

export interface AllocationDialogData {
  items: T212AllocationItem[];
}

/** Opened from the treemap's "…" tile: every open position with its share; closes with the one tapped. */
@Component({
  selector: 'app-allocation-dialog',
  imports: [MatIconButton, StockLogo, Icon, PercentPipe],
  template: `
    <div class="max-h-[90dvh] overflow-y-auto p-4">
      <div class="flex items-center gap-3">
        <h2 class="flex-1 text-lg font-bold" i18n>All positions</h2>
        <button
          matIconButton
          type="button"
          aria-label="Close"
          i18n-aria-label
          (click)="ref.close()"
        >
          <app-icon name="close" />
        </button>
      </div>
      <ul class="mt-1">
        @for (item of data.items; track item.t212Ticker) {
          <li>
            <button
              type="button"
              class="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-container-high"
              (click)="ref.close(item)"
            >
              <app-stock-logo [symbol]="ticker(item)" [logoUrl]="item.logoUrl" [size]="36" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{{ item.name }}</span>
                <span
                  class="block truncate text-[12.5px] font-medium text-on-surface-variant uppercase"
                  >{{ ticker(item) }} · {{ share(item) }}</span
                >
              </span>
              <span class="shrink-0 text-[13px] font-medium" [class]="tone(item.dayChangePct)">{{
                item.dayChangePct | pct
              }}</span>
            </button>
          </li>
        }
      </ul>
    </div>
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

  protected tone(value: number | null): string {
    return toneClass(value);
  }
}
