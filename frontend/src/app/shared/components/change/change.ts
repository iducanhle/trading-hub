import { Component, booleanAttribute, computed, input } from '@angular/core';
import { formatPercent, toneOf } from '../../utils/format';

const TONE_TEXT = { gain: 'text-gain', loss: 'text-loss', flat: 'text-on-surface-variant' } as const;
const TONE_PILL = {
  gain: 'bg-gain-container',
  loss: 'bg-loss-container',
  flat: 'bg-surface-container-high',
} as const;

/** A signed percentage in the gain / loss colour; `pill` adds a tinted background. */
@Component({
  selector: 'app-change',
  template: `{{ text() }}`,
  host: { class: 'tabular-nums whitespace-nowrap', '[class]': 'classes()' },
})
export class Change {
  readonly value = input<number | null | undefined>(null);
  readonly digits = input(2);
  readonly pill = input(false, { transform: booleanAttribute });

  protected readonly text = computed(() => formatPercent(this.value(), this.digits()));
  protected readonly classes = computed(() => {
    const tone = toneOf(this.value());
    return this.pill() ? `${TONE_TEXT[tone]} ${TONE_PILL[tone]} rounded-md px-1.5 py-0.5` : TONE_TEXT[tone];
  });
}
