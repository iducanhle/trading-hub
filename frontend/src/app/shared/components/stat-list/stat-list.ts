import { Component, booleanAttribute, input } from '@angular/core';
import { TermInfo } from '../term-info/term-info';
import { TermId } from '../term-info/terms';

/**
 * A list of figures, one per line: label on the left, value right-aligned (docs/REDESIGN-SPEC.md). `card` puts it on
 * a card (one step lighter inside dialogs, see styles.css). Holds `appStatRow` divs.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- an attribute on <dl> keeps the list valid HTML
  selector: 'dl[appStatList]',
  template: `<ng-content />`,
  host: {
    class: 'm-0 block',
    '[class]': `card()
      ? 'app-stat-card rounded-[22px] bg-surface-container px-[18px] py-1.5'
      : 'px-1'`,
  },
})
export class StatList {
  readonly card = input(false, { transform: booleanAttribute });
}

/**
 * One line of a `StatList`: the label (with an optional ⓘ term) and the projected value. `total` is the sum under a
 * divider, always the last row; `sub` is a smaller breakdown right under it ("of which …").
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- <dl> may only hold <div>, <dt> and <dd>
  selector: 'div[appStatRow]',
  imports: [TermInfo],
  template: `
    <dt
      class="inline-flex min-w-0 items-center gap-1"
      [class]="
        total()
          ? 'text-[15px] font-bold'
          : sub()
            ? 'text-[13px] font-medium text-on-surface-variant'
            : 'text-sm font-medium text-on-surface-variant'
      "
    >
      <span>{{ label() }}</span>
      @if (term(); as t) {
        <app-term-info [term]="t" />
      }
    </dt>
    <dd
      class="m-0 shrink-0 text-right whitespace-nowrap tabular-nums"
      [class]="
        total()
          ? 'text-base font-bold'
          : sub()
            ? 'text-sm font-semibold'
            : 'text-[15px] font-semibold'
      "
    >
      <ng-content />
    </dd>
  `,
  host: {
    class: 'flex items-baseline justify-between gap-3',
    '[class]': `total()
      ? 'border-t border-outline-variant pt-[11px] pb-[9px]'
      : sub() ? 'pb-[9px]' : 'py-[9px]'`,
  },
})
export class StatRow {
  readonly label = input.required<string>();
  readonly term = input<TermId | null>(null);
  readonly total = input(false, { transform: booleanAttribute });
  readonly sub = input(false, { transform: booleanAttribute });
}
