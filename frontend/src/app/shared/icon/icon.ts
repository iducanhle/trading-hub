import { Component, computed, input } from '@angular/core';
import { ICON_PATHS, IconName } from './icon-paths';

/**
 * Lucide outline icon as inline SVG (no icon font to download): stroked, round caps and joins, and filled as well for
 * the `-fill` names. Decorative: give the surrounding button an aria-label. Inside Material buttons add
 * `matButtonIcon` for the right spacing.
 */
@Component({
  selector: 'app-icon',
  template: `<svg
    viewBox="0 0 24 24"
    [attr.width]="size()"
    [attr.height]="size()"
    [attr.stroke-width]="strokeWidth()"
    [class.filled]="filled()"
    focusable="false"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
    svg {
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    svg.filled {
      fill: currentColor;
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  /** In 24×24 icon units, so the line gets thinner with the size, as in the designs. */
  readonly strokeWidth = input(1.6);
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
  protected readonly filled = computed(() => this.name().endsWith('-fill'));
}
