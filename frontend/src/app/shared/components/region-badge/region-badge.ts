import { Component, computed, input } from '@angular/core';
import { Region } from '../../../core/models/contract';

/** Tiny "US" / "EU" badge. */
@Component({
  selector: 'app-region-badge',
  template: `{{ region() }}`,
  host: {
    class:
      'inline-flex items-center rounded-full bg-surface-container-high px-[7px] py-[3px] text-[10.5px] font-extrabold tracking-[.04em] text-on-surface-variant',
    '[attr.aria-label]': 'label()',
  },
})
export class RegionBadge {
  readonly region = input.required<Region>();
  protected readonly label = computed(() =>
    this.region() === 'US' ? $localize`United States` : $localize`Europe`,
  );
}
