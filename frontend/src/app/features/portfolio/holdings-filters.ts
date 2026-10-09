import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SORT_LABELS } from './portfolio-labels';
import { SortDirection } from './portfolio-model';
import { Dialog } from '../../shared/components/dialog/dialog';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

export type HoldingsSort = 'value' | 'pnl' | 'pnlPct';

export interface HoldingsView {
  sort: HoldingsSort;
  direction: SortDirection;
}

/** Largest value first, as Trading 212 lists them. */
export const DEFAULT_HOLDINGS_VIEW: HoldingsView = { sort: 'value', direction: 'desc' };

export interface HoldingsFilterContext {
  view: HoldingsView;
  change: (view: HoldingsView) => void;
}

/** Sort of the Open positions card (value, profit/loss or profit/loss %, either direction); a draft until Done. */
@Component({
  selector: 'app-holdings-filter-sheet',
  imports: [Dialog, MatButton, Segmented, Segment],
  template: `
    <app-dialog title="Filters" i18n-title>
      <div class="flex flex-col gap-4">
        <div>
          <p id="holdings-sort" class="mb-2 app-label" i18n>Sort</p>
          <app-segmented
            aria-labelledby="holdings-sort"
            stretch
            [value]="draft().sort"
            (valueChange)="patch({ sort: $event })"
          >
            <app-segment value="value">{{ sortLabels.value }}</app-segment>
            <app-segment value="pnl">{{ sortLabels.pnl }}</app-segment>
            <app-segment value="pnlPct">{{ sortLabels.pnlPct }}</app-segment>
          </app-segmented>
        </div>
        <div>
          <p id="holdings-direction" class="mb-2 app-label" i18n="Sort direction">Order</p>
          <app-segmented
            aria-labelledby="holdings-direction"
            stretch
            [value]="draft().direction"
            (valueChange)="patch({ direction: $event })"
          >
            <app-segment value="desc" i18n="Sort direction|Largest first">Descending</app-segment>
            <app-segment value="asc" i18n="Sort direction|Smallest first">Ascending</app-segment>
          </app-segmented>
        </div>
      </div>
      <button dialogActions matButton="tonal" type="button" (click)="draft.set(defaults)">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button dialogActions matButton="filled" type="button" (click)="done()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-dialog>
  `,
})
export class HoldingsFilterSheet {
  private readonly context = inject<HoldingsFilterContext>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<HoldingsFilterSheet>);

  protected readonly sortLabels = SORT_LABELS;
  protected readonly defaults = DEFAULT_HOLDINGS_VIEW;
  protected readonly draft = signal<HoldingsView>(this.context.view);

  protected patch(patch: Partial<HoldingsView>): void {
    this.draft.update((view) => ({ ...view, ...patch }));
  }

  protected done(): void {
    this.context.change(this.draft());
    this.ref.close();
  }
}
