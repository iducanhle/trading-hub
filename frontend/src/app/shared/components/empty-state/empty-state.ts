import { Component, input } from '@angular/core';
import { Icon } from '../../icon/icon';
import { IconName } from '../../icon/icon-paths';

/** Friendly empty state: an icon, a title, a line of text and (projected) an action. */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  template: `
    <div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span
        class="mb-2 flex size-16 items-center justify-center rounded-full bg-surface-container-high text-primary"
      >
        <app-icon [name]="icon()" [size]="32" />
      </span>
      <h2 class="text-lg font-semibold">{{ title() }}</h2>
      @if (text()) {
        <p class="max-w-xs text-sm text-on-surface-variant">{{ text() }}</p>
      }
      <div class="mt-3"><ng-content /></div>
    </div>
  `,
})
export class EmptyState {
  readonly icon = input<IconName>('info');
  readonly title = input.required<string>();
  readonly text = input<string>();
}
