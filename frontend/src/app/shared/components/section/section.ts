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
    <section class="pt-7" [attr.aria-labelledby]="headingId">
      @if (collapsible()) {
        <h2 class="m-0">
          <button
            type="button"
            [id]="headingId"
            class="flex min-h-12 w-full items-center gap-2 rounded-2xl px-5 text-left text-lg font-bold hover:bg-surface-container"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="contentId"
            (click)="expanded.set(!expanded())"
          >
            <span class="flex-1">{{ title() }}</span>
            <ng-content select="[sectionMeta]" />
            <app-icon
              name="keyboard_arrow_down"
              class="text-on-surface-variant transition-transform duration-200"
              [class.rotate-180]="expanded()"
            />
          </button>
        </h2>
      } @else {
        <h2 [id]="headingId" class="flex min-h-12 items-center gap-2 px-5 text-lg font-bold">
          <span class="flex-1">{{ title() }}</span>
          <ng-content select="[sectionMeta]" />
        </h2>
      }
      @if (expanded() || !collapsible()) {
        <div [id]="contentId" class="px-4 pt-2 pb-2">
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
