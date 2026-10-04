import { Component, computed, inject } from '@angular/core';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Icon } from '../../icon/icon';
import { Sheet } from '../sheet/sheet';
import { TERMS, TermId } from './terms';

/** The explanation of one term, opened by TermInfo as a bottom sheet on every screen size. */
@Component({
  selector: 'app-term-sheet',
  imports: [RouterLink, MatButton, Icon, Sheet],
  template: `
    <app-sheet>
      <div class="mb-4 flex items-center gap-2.5">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-primary"
          aria-hidden="true"
          ><app-icon name="info" [size]="20"
        /></span>
        <h2 class="app-title-modal">{{ term().title }}</h2>
      </div>
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
      <button sheetActions matButton="tonal" type="button" (click)="close()">
        <ng-container i18n="Closes a term explanation">Got it</ng-container>
      </button>
    </app-sheet>
  `,
})
export class TermSheet {
  private readonly sheetRef = inject(MatBottomSheetRef);
  private readonly id = inject<TermId>(MAT_BOTTOM_SHEET_DATA);

  protected readonly term = computed(() => TERMS[this.id]);

  protected close(): void {
    this.sheetRef.dismiss();
  }
}
