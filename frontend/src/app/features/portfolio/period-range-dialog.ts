import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
  MatDatepickerToggleIcon,
} from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Dialog } from '../../shared/components/dialog/dialog';
import { Icon } from '../../shared/icon/icon';
import { parseIsoDate, toIsoDate, todayIso } from '../../shared/utils/dates';
import { APP_LOCALE } from '../../shared/utils/locale';

/** Inclusive days; either may be null (open-ended). */
export interface PeriodRange {
  from: string | null;
  to: string | null;
}

/**
 * Start and end day of a custom period, each picked in a calendar (the field opens it too, so no typing), as a draft
 * until Done; closes with the range, or with nothing when cancelled or both days are empty. Days in the wrong order
 * are swapped. Fields are as tall as the dialog buttons (material-theme.scss).
 */
@Component({
  selector: 'app-period-range-dialog',
  imports: [
    Dialog,
    Icon,
    MatButton,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatInput,
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatDatepickerToggleIcon,
  ],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: APP_LOCALE }],
  template: `
    <app-dialog title="Custom period" i18n-title="Title of the dialog choosing a date range">
      <div class="flex flex-col gap-3">
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n="Start of a date range">From</mat-label>
          <input
            matInput
            readonly
            [matDatepicker]="fromPicker"
            [value]="from()"
            [max]="to() ?? today"
            (click)="fromPicker.open()"
            (dateChange)="from.set($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="fromPicker">
            <app-icon matDatepickerToggleIcon name="calendar_month" [size]="20" />
          </mat-datepicker-toggle>
          <mat-datepicker #fromPicker />
        </mat-form-field>
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n="End of a date range">To</mat-label>
          <input
            matInput
            readonly
            [matDatepicker]="toPicker"
            [value]="to()"
            [min]="from()"
            [max]="today"
            (click)="toPicker.open()"
            (dateChange)="to.set($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="toPicker">
            <app-icon matDatepickerToggleIcon name="calendar_month" [size]="20" />
          </mat-datepicker-toggle>
          <mat-datepicker #toPicker />
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

  protected readonly today = parseIsoDate(todayIso());
  protected readonly from = signal<Date | null>(
    this.data.from ? parseIsoDate(this.data.from) : null,
  );
  protected readonly to = signal<Date | null>(this.data.to ? parseIsoDate(this.data.to) : null);

  protected done(): void {
    let from = this.from() ? toIsoDate(this.from()!) : null;
    let to = this.to() ? toIsoDate(this.to()!) : null;
    if (!from && !to) {
      this.ref.close();
      return;
    }
    if (from && to && from > to) [from, to] = [to, from];
    this.ref.close({ from, to });
  }
}
