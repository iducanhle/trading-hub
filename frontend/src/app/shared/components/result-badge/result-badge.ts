import { Component, computed, input } from '@angular/core';
import { EarningsResult } from '../../../core/models/contract';
import { resultLabel } from '../../utils/format';

/** BEAT / MISS / INLINE pill; the word is always shown, so colour is never the only cue. */
@Component({
  selector: 'app-result-badge',
  template: `{{ label() }}`,
  host: {
    class:
      'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold uppercase tracking-wide',
    '[class]': 'tone()',
  },
})
export class ResultBadge {
  readonly result = input<EarningsResult | 'UPCOMING' | null>(null);

  protected readonly label = computed(() => {
    const result = this.result();
    return result === 'UPCOMING' ? $localize`Upcoming` : resultLabel(result);
  });
  protected readonly tone = computed(() => {
    switch (this.result()) {
      case 'BEAT':
        return 'bg-gain-container text-gain';
      case 'MISS':
        return 'bg-loss-container text-loss';
      case 'UPCOMING':
        return 'bg-primary-container text-on-primary-container';
      default:
        return 'bg-surface-container-highest text-on-surface-variant';
    }
  });
}
