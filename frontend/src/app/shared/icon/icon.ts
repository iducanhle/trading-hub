import { Component, computed, input } from '@angular/core';
import { ICON_PATHS, IconName } from './icon-paths';

/**
 * Material Symbols icon as inline SVG (no icon font to download). Decorative: give the surrounding button an
 * aria-label. Inside Material buttons add `matButtonIcon` for the right spacing.
 */
@Component({
  selector: 'app-icon',
  template: `<svg viewBox="0 -960 960 960" [attr.width]="size()" [attr.height]="size()" focusable="false">
    <path [attr.d]="path()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
    svg {
      fill: currentColor;
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
