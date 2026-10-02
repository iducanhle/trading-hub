import { Component, booleanAttribute, computed, input } from '@angular/core';
import { formatPercent, formatSignedMoney, toneClass } from '../../shared/utils/format';

/**
 * A profit or loss: signed amount (always with + or −, so it never relies on colour alone), green or red, with an
 * optional percentage. `—` when unknown.
 */
@Component({
  selector: 'app-pnl',
  template: `
    <span class="tabular-nums" [class]="tone()" [class.font-semibold]="strong()">{{
      amount()
    }}</span>
    @if (pct() !== undefined) {
      <span class="ml-1 text-xs tabular-nums" [class]="tone()">{{ percent() }}</span>
    }
  `,
  host: { class: 'inline-flex flex-wrap items-baseline justify-end' },
})
export class Pnl {
  readonly value = input<number | null | undefined>(null);
  readonly currency = input<string | null | undefined>(null);
  /** Leave unset to hide the percentage; null shows `—`. */
  readonly pct = input<number | null | undefined>(undefined);
  readonly strong = input(false, { transform: booleanAttribute });

  protected readonly tone = computed(() => toneClass(this.value()));
  protected readonly amount = computed(() => formatSignedMoney(this.value(), this.currency()));
  protected readonly percent = computed(() => formatPercent(this.pct() ?? null));
}
