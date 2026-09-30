import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { errorMessage } from '../../../core/api/api-error';
import { Icon } from '../../icon/icon';

/** Inline error with a Retry button, for a page or a single section. */
@Component({
  selector: 'app-error-state',
  imports: [MatButton, Icon],
  template: `
    <div
      role="alert"
      class="flex flex-col items-center gap-3 rounded-2xl bg-surface-container-low px-4 text-center"
      [class.py-8]="!compact()"
      [class.py-4]="compact()"
    >
      <app-icon name="cloud_off" class="text-on-surface-variant" [size]="compact() ? 24 : 32" />
      <p class="text-sm text-on-surface-variant">{{ text() }}</p>
      <button matButton="outlined" type="button" (click)="retry.emit()">
        <app-icon matButtonIcon name="refresh" [size]="18" />
        <ng-container i18n>Retry</ng-container>
      </button>
    </div>
  `,
})
export class ErrorState {
  readonly error = input<unknown>();
  /** Overrides the message derived from the error. */
  readonly message = input<string>();
  readonly compact = input(false, { transform: booleanAttribute });
  readonly retry = output<void>();

  protected readonly text = computed(() => this.message() ?? errorMessage(this.error()));
}
