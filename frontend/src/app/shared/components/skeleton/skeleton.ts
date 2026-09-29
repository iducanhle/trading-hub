import { Component, input } from '@angular/core';

/** A pulsing placeholder block; size it with classes (`class="h-4 w-24"`). */
@Component({
  selector: 'app-skeleton',
  template: '',
  host: {
    class: 'block animate-pulse bg-surface-container-highest',
    '[class.rounded-full]': "shape() === 'circle'",
    '[class.rounded-md]': "shape() === 'line'",
    '[class.rounded-2xl]': "shape() === 'card'",
    'aria-hidden': 'true',
  },
})
export class Skeleton {
  readonly shape = input<'line' | 'circle' | 'card'>('line');
}
