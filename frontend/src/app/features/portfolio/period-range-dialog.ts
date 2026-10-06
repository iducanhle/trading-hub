import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Dialog } from '../../shared/components/dialog/dialog';
import { todayIso } from '../../shared/utils/dates';

/** Inclusive days; either may be null (open-ended). */
export interface PeriodRange {
  from: string | null;
  to: string | null;
}

/**
 * Start and end day of a custom period, as a draft until Done; closes with the range, or with nothing when cancelled
 * or both days are empty. Days in the wrong order are swapped.
 */
@Component({
  selector: 'app-period-range-dialog',
  imports: [Dialog, MatButton, MatFormField, MatLabel, MatInput],
  template: `
    <app-dialog title="Custom period" i18n-title="Title of the dialog choosing a date range">
      <div class="flex flex-col gap-3">
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n="Start of a date range">From</mat-label>
          <input
            matInput
            type="date"
            [value]="from() ?? ''"
            [max]="today"
            (change)="from.set(day($event))"
          />
        </mat-form-field>
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n="End of a date range">To</mat-label>
          <input
            matInput
            type="date"
            [value]="to() ?? ''"
            [max]="today"
            (change)="to.set(day($event))"
          />
        </mat-form-field>
      </div>
      <button dialogActions matButton="tonal" type="button" (click)="ref.close()">
        <ng-container i18n>Cancel</ng-container>
      </button>
      <button dialogActions matButton="filled" type="button" (click)="done()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-dialog>
  `,
})
export class PeriodRangeDialog {
  private readonly data = inject<PeriodRange>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<PeriodRangeDialog, PeriodRange>>(MatDialogRef);

  protected readonly today = todayIso();
  protected readonly from = signal(this.data.from);
  protected readonly to = signal(this.data.to);

  protected day(event: Event): string | null {
    return (event.target as HTMLInputElement).value || null;
  }

  protected done(): void {
    let from = this.from();
    let to = this.to();
    if (!from && !to) {
      this.ref.close();
      return;
    }
    if (from && to && from > to) [from, to] = [to, from];
    this.ref.close({ from, to });
  }
}
