import { Component, computed, inject, input } from '@angular/core';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { SettingsService } from '../../../core/services/settings.service';
import { Icon } from '../../icon/icon';
import { TermSheet } from './term-sheet';
import { TERMS, TermId } from './terms';

/**
 * A small ⓘ button after a trading term that explains it for beginners: a bottom sheet on phones, a dialog from
 * `lg`. Hidden when "Show term explanations" is off in the settings.
 */
@Component({
  selector: 'app-term-info',
  imports: [Icon],
  template: `
    @if (enabled()) {
      <button
        type="button"
        class="relative inline-flex size-5 items-center justify-center rounded-full align-[-0.2em] text-on-surface-variant after:absolute after:-inset-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        [attr.aria-label]="label()"
        (click)="open($event)"
      >
        <app-icon name="info" [size]="16" />
      </button>
    }
  `,
  host: { class: 'inline-flex' },
})
export class TermInfo {
  private readonly settings = inject(SettingsService);
  private readonly sheet = inject(MatBottomSheet);
  private readonly dialog = inject(MatDialog);

  readonly term = input.required<TermId>();

  protected readonly enabled = computed(() => this.settings.settings().termHints);
  protected readonly label = computed(() => $localize`Explain: ${TERMS[this.term()].title}:term:`);

  protected open(event: Event): void {
    event.stopPropagation();
    const data = this.term();
    if (matchMedia('(min-width: 64rem)').matches) {
      this.dialog.open(TermSheet, { data, maxWidth: '28rem', autoFocus: 'dialog' });
    } else {
      this.sheet.open(TermSheet, { data });
    }
  }
}
