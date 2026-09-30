import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { TERMS, TermId } from './terms';

/** The explanation of one term, opened by TermInfo as a bottom sheet (phones) or a dialog (desktop). */
@Component({
  selector: 'app-term-sheet',
  imports: [MatButton, RouterLink],
  template: `
    <div class="px-5 pt-2 pb-safe lg:p-6">
      <div
        class="mx-auto mb-3 h-1 w-8 rounded-full bg-outline-variant lg:hidden"
        aria-hidden="true"
      ></div>
      <h2 class="mb-3 text-lg font-semibold">{{ term().title }}</h2>
      <div class="space-y-3 text-sm leading-relaxed">
        @for (paragraph of term().body; track $index) {
          <p>{{ paragraph }}</p>
        }
        @if (term().example; as example) {
          <p class="rounded-xl bg-surface-container-high px-3 py-2 tabular-nums">
            <span class="font-medium" i18n="A worked example follows">Example:</span>
            {{ example }}
          </p>
        }
      </div>
      <div class="mt-5 flex justify-end">
        <button matButton="filled" type="button" (click)="close()" i18n>Got it</button>
      </div>
      <p class="mt-4 mb-4 text-center text-xs text-on-surface-variant lg:mb-0" i18n>
        You can turn off these explanations in
        <a routerLink="/settings" class="text-primary underline" (click)="close()">Settings</a>.
      </p>
    </div>
  `,
})
export class TermSheet {
  private readonly sheetRef = inject(MatBottomSheetRef, { optional: true });
  private readonly dialogRef = inject(MatDialogRef, { optional: true });
  private readonly id: TermId =
    inject<TermId>(MAT_BOTTOM_SHEET_DATA, { optional: true }) ?? inject<TermId>(MAT_DIALOG_DATA);

  protected readonly term = computed(() => TERMS[this.id]);

  protected close(): void {
    this.sheetRef?.dismiss();
    this.dialogRef?.close();
  }
}
