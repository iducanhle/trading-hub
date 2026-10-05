import { Component, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialogClose, MatDialogConfig, MatDialogTitle } from '@angular/material/dialog';
import { Icon } from '../../icon/icon';

/**
 * How every dialog opens (docs/REDESIGN-SPEC.md): full width less 16 px a side on phones, 480 px from there up, never
 * taller than the screen less its safe areas (status bar, home indicator). Spread it into `MatDialog.open` and add
 * `data`.
 */
export const DIALOG_CONFIG: MatDialogConfig = {
  width: 'calc(100vw - 32px)',
  maxWidth: '30rem',
  maxHeight: 'calc(100dvh - 32px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
  autoFocus: 'dialog',
  restoreFocus: true,
};

/**
 * The layout of every dialog: header (optional `dialogLeading` logo, the title and subtitle, optional
 * `dialogTrailing` pill or count, close button), a body that scrolls on its own, and an optional footer of buttons
 * marked `dialogActions`, side by side and 52 px high. A header that links somewhere projects its own `dialogHeader`
 * block instead of `title`; it must hold an element with `matDialogTitle` and `class="app-dialog-title"`.
 */
@Component({
  selector: 'app-dialog',
  imports: [MatIconButton, MatDialogClose, MatDialogTitle, Icon],
  template: `
    <div class="flex max-h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col">
      <div class="flex items-center gap-3 px-5 pt-5 lg:px-6 lg:pt-6">
        <ng-content select="[dialogHeader]" />
        <ng-content select="[dialogLeading]" />
        @if (title()) {
          <div class="min-w-0 flex-1">
            <h2 mat-dialog-title class="app-dialog-title truncate">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="truncate app-row-meta">{{ subtitle() }}</p>
            }
          </div>
        }
        <ng-content select="[dialogTrailing]" />
        <button
          matIconButton
          type="button"
          class="-my-1.5 -mr-2.5 shrink-0"
          aria-label="Close"
          i18n-aria-label
          mat-dialog-close
        >
          <app-icon name="close" />
        </button>
      </div>
      <div class="dialog-body min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 lg:px-6 lg:pb-6">
        <ng-content />
      </div>
      <div class="dialog-actions flex gap-2.5 px-5 pb-5 empty:hidden lg:px-6 lg:pb-6">
        <ng-content select="[dialogActions]" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .dialog-actions {
      --mat-button-filled-container-height: 52px;
      --mat-button-tonal-container-height: 52px;
      --mat-button-outlined-container-height: 52px;
      --mat-button-text-container-height: 52px;
    }
    /* With buttons below, the body ends 12 px above them instead of the full 20-24 px bottom padding. */
    .dialog-body:has(+ .dialog-actions:not(:empty)) {
      padding-bottom: 12px;
    }
    .dialog-actions > ::ng-deep * {
      flex: 1 1 0;
    }
  `,
})
export class Dialog {
  readonly title = input('');
  readonly subtitle = input('');
}
