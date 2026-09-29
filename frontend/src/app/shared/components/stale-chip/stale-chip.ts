import { Component, input } from '@angular/core';
import { Icon } from '../../icon/icon';
import { DateTimePipe } from '../../pipes/format.pipes';

/** Subtle hint for `stale: true` responses: the provider failed and cached data is shown. */
@Component({
  selector: 'app-stale-chip',
  imports: [Icon, DateTimePipe],
  template: `
    <span
      class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-1 text-xs text-on-surface-variant"
      role="status"
    >
      <app-icon name="history" [size]="14" />
      Data may be outdated · {{ asOf() | dateTime }}
    </span>
  `,
})
export class StaleChip {
  readonly asOf = input<string | null>(null);
}
