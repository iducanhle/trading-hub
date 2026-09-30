import { Component, computed, input } from '@angular/core';
import { Region } from '../../../core/models/contract';

/** Tiny "US" / "EU" badge. */
@Component({
  selector: 'app-region-badge',
  template: `{{ region() }}`,
  host: {
    class:
      'inline-flex h-5 items-center rounded-md border border-outline-variant px-1.5 text-[11px] font-semibold tracking-wide text-on-surface-variant',
    '[attr.aria-label]': 'label()',
  },
})
export class RegionBadge {
  readonly region = input.required<Region>();
  protected readonly label = computed(() =>
    this.region() === 'US' ? $localize`United States` : $localize`Europe`,
  );
}
