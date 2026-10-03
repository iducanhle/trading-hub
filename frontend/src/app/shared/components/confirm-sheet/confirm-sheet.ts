import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { firstValueFrom } from 'rxjs';
import { Sheet } from '../sheet/sheet';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirm: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

/** A yes/no question in a bottom sheet; dismissing it (swipe, backdrop, Escape) counts as no. */
@Component({
  selector: 'app-confirm-sheet',
  imports: [MatButton, Sheet],
  template: `
    <app-sheet [title]="data.title">
      <p class="text-[15px] text-on-surface-variant">{{ data.message }}</p>
      <button sheetActions matButton="tonal" type="button" (click)="ref.dismiss(false)">
        <ng-container i18n>Cancel</ng-container>
      </button>
      <button
        sheetActions
        matButton="filled"
        type="button"
        [class.danger]="data.danger"
        (click)="ref.dismiss(true)"
      >
        {{ data.confirm }}
      </button>
    </app-sheet>
  `,
  styles: `
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmSheet {
  protected readonly data = inject<ConfirmOptions>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<ConfirmSheet, boolean>);
}

/** Opens a confirmation sheet; resolves true only when the user confirmed. */
export async function confirmInSheet(
  sheet: MatBottomSheet,
  options: ConfirmOptions,
): Promise<boolean> {
  const ref = sheet.open<ConfirmSheet, ConfirmOptions, boolean>(ConfirmSheet, {
    data: options,
    ariaLabel: options.title,
  });
  return (await firstValueFrom(ref.afterDismissed())) === true;
}
