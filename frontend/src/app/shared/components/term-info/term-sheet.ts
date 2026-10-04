import { Component, computed, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { Sheet } from '../sheet/sheet';
import { TERMS, TermId } from './terms';

/** The explanation of one term, opened by TermInfo as a bottom sheet (phones) or a dialog (desktop). */
@Component({
  selector: 'app-term-sheet',
  imports: [RouterLink, Sheet],
  template: `
    <app-sheet [title]="term().title">
      <div class="space-y-3 text-[15px] leading-relaxed">
        @for (paragraph of term().body; track $index) {
          <p>{{ paragraph }}</p>
        }
        @if (term().example; as example) {
          <p class="text-on-surface-variant">
            <span class="font-medium" i18n="A worked example follows">Example:</span>
            {{ example }}
          </p>
        }
      </div>
      <p class="mt-5 text-center text-xs text-on-surface-variant" i18n>
        You can turn off these explanations in
        <a routerLink="/settings" class="text-primary underline" (click)="close()">Settings</a>.
      </p>
    </app-sheet>
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
