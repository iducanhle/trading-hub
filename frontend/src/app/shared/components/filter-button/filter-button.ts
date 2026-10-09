import { Component, booleanAttribute, computed, input, output } from '@angular/core';
import { Icon } from '../../icon/icon';

/** The 46 px "Filters" button next to a search field; a dot in the accent colour marks active filters. */
@Component({
  selector: 'app-filter-button',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="relative flex size-10 items-center justify-center rounded-[14px] text-on-surface"
      [class]="
        raised()
          ? 'bg-surface-container-high hover:bg-surface-container-highest'
          : 'bg-surface-container hover:bg-surface-container-high'
      "
      [attr.aria-label]="label()"
      (click)="pressed.emit()"
    >
      <app-icon name="tune" />
      @if (active()) {
        <span class="absolute top-2 right-2 size-2 rounded-full bg-primary"></span>
      }
    </button>
  `,
  host: { class: 'shrink-0' },
})
export class FilterButton {
  readonly active = input(false, { transform: booleanAttribute });
  /** For use inside a card: one step lighter, like the card's tiles and search field. */
  readonly raised = input(false, { transform: booleanAttribute });
  readonly pressed = output<void>();

  protected readonly label = computed(() =>
    this.active() ? $localize`Filters (active)` : $localize`Filters`,
  );
}
