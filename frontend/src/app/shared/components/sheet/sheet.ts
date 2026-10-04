import { Component, input } from '@angular/core';

/**
 * The layout of a bottom sheet's content: drag handle, title, body (projected) and an optional footer: buttons marked
 * `sheetActions` sit side by side, share the width and are 52 px high. Dialogs on desktop reuse it; the handle
 * hides from `lg` up.
 */
@Component({
  selector: 'app-sheet',
  template: `
    <div
      class="mx-auto mt-1 mb-4 h-[5px] w-10 rounded-full bg-surface-container-high lg:hidden"
      aria-hidden="true"
    ></div>
    @if (title()) {
      <h2 class="mb-5 text-[22px] leading-tight font-bold">{{ title() }}</h2>
    }
    <ng-content />
    <div class="sheet-actions mt-6 flex gap-2.5 empty:hidden">
      <ng-content select="[sheetActions]" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 0 4px calc(env(safe-area-inset-bottom) + 20px);
    }
    /* From lg the sheet is a dialog's content, which has no padding of its own. */
    @media (min-width: 64rem) {
      :host {
        padding: 28px 28px 24px;
      }
    }
    .sheet-actions {
      --mat-button-filled-container-height: 52px;
      --mat-button-tonal-container-height: 52px;
      --mat-button-outlined-container-height: 52px;
      --mat-button-text-container-height: 52px;
    }
    .sheet-actions > ::ng-deep * {
      flex: 1 1 0;
    }
  `,
})
export class Sheet {
  readonly title = input('');
}
