import { Component, booleanAttribute, input, model } from '@angular/core';
import { Icon } from '../../icon/icon';

let nextId = 0;

/**
 * A titled block of the stock page. Collapsible sections hide their content behind a disclosure button; the owner
 * keeps `expanded` (usually persisted) and skips loading data while collapsed.
 */
@Component({
  selector: 'app-section',
  imports: [Icon],
  template: `
    <!-- Same card and disclosure header as the portfolio cards (Asset allocation, Open positions). -->
    <section class="app-section-card app-card mx-4 mt-4 block" [attr.aria-labelledby]="headingId">
      @if (collapsible()) {
        <h2 class="m-0">
          <button
            type="button"
            [id]="headingId"
            class="-m-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-2xl p-2 text-left hover:bg-surface-container-high"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="contentId"
            (click)="expanded.set(!expanded())"
          >
            <span class="app-title-card min-w-0 flex-1">{{ title() }}</span>
            <ng-content select="[sectionMeta]" />
            <app-icon
              name="keyboard_arrow_down"
              class="text-on-surface-variant transition-transform duration-200"
              [class.rotate-180]="expanded()"
            />
          </button>
        </h2>
      } @else {
        <h2 [id]="headingId" class="m-0 flex items-center gap-2">
          <span class="app-title-card min-w-0 flex-1">{{ title() }}</span>
          <ng-content select="[sectionMeta]" />
        </h2>
      }
      @if (expanded() || !collapsible()) {
        <div [id]="contentId" class="pt-3">
          <ng-content />
        </div>
      }
    </section>
  `,
})
export class Section {
  readonly title = input.required<string>();
  readonly collapsible = input(true, { transform: booleanAttribute });
  readonly expanded = model(true);

  private readonly id = nextId++;
  protected readonly headingId = `section-${this.id}-title`;
  protected readonly contentId = `section-${this.id}-content`;
}
