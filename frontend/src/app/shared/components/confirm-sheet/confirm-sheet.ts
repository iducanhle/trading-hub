import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheet,
  MatBottomSheetRef,
} from '@angular/material/bottom-sheet';
import { firstValueFrom } from 'rxjs';

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
  imports: [MatButton],
  template: `
    <div class="px-4 pb-safe">
      <div
        class="mx-auto mt-1 mb-3 h-1 w-8 rounded-full bg-outline-variant"
        aria-hidden="true"
      ></div>
      <h2 class="mb-2 text-lg font-semibold">{{ data.title }}</h2>
      <p class="text-sm text-on-surface-variant">{{ data.message }}</p>
      <div class="mt-6 mb-4 flex justify-end gap-3">
        <button matButton type="button" (click)="ref.dismiss(false)" i18n>Cancel</button>
        <button
          matButton="filled"
          type="button"
          [class.danger]="data.danger"
          (click)="ref.dismiss(true)"
        >
          {{ data.confirm }}
        </button>
      </div>
    </div>
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
