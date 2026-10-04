import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DIALOG_CONFIG, Dialog } from '../dialog/dialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirm: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

/** A yes/no question in a dialog; closing it any other way (close button, backdrop, Escape) counts as no. */
@Component({
  selector: 'app-confirm-sheet',
  imports: [MatButton, Dialog],
  template: `
    <app-dialog [title]="data.title">
      <p class="text-[15px] text-on-surface-variant">{{ data.message }}</p>
      <button dialogActions matButton="tonal" type="button" (click)="ref.close(false)">
        <ng-container i18n>Cancel</ng-container>
      </button>
      <button
        dialogActions
        matButton="filled"
        type="button"
        [class.danger]="data.danger"
        (click)="ref.close(true)"
      >
        {{ data.confirm }}
      </button>
    </app-dialog>
  `,
  styles: `
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmSheet {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<ConfirmSheet, boolean>);
}

/** Opens a confirmation dialog; resolves true only when the user confirmed. */
export async function confirmInDialog(
  dialog: MatDialog,
  options: ConfirmOptions,
): Promise<boolean> {
  const ref = dialog.open<ConfirmSheet, ConfirmOptions, boolean>(ConfirmSheet, {
    ...DIALOG_CONFIG,
    data: options,
    ariaLabel: options.title,
  });
  return (await firstValueFrom(ref.afterClosed())) === true;
}
