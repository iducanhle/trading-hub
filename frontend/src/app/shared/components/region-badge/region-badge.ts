import { Component, computed, input } from '@angular/core';
import { Region } from '../../../core/models/contract';

/** Tiny "US" / "EU" badge. */
@Component({
  selector: 'app-region-badge',
  template: `{{ region() }}`,
  host: {
    class: 'app-tag bg-surface-container-high text-on-surface-variant',
    '[attr.aria-label]': 'label()',
  },
})
export class RegionBadge {
  readonly region = input.required<Region>();
  protected readonly label = computed(() =>
    this.region() === 'US' ? $localize`United States` : $localize`Europe`,
  );
}
