import { Component, computed, input } from '@angular/core';
import { MarketEvent } from '../../core/models/contract';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { CATEGORY_ICONS } from './events-model';

/**
 * The picture of an event: the company's logo for a report, else a circle with the category's icon whose colour
 * shows the importance. Decorative, the title is always shown next to it.
 */
@Component({
  selector: 'app-event-badge',
  imports: [StockLogo, Icon],
  template: `
    @if (event().symbol) {
      <app-stock-logo
        [symbol]="event().symbol!"
        [logoUrl]="event().logoUrl"
        [size]="size()"
        [followed]="followed()"
      />
    } @else {
      <span
        class="flex size-full items-center justify-center"
        [class]="tone()"
        [style.border-radius.px]="size() * 0.29"
      >
        <app-icon [name]="icon()" [size]="iconSize()" />
      </span>
    }
  `,
  host: {
    class: 'inline-block shrink-0',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    'aria-hidden': 'true',
  },
})
export class EventBadge {
  readonly event = input.required<MarketEvent>();
  readonly size = input(40);
  readonly followed = input(false);

  protected readonly icon = computed(() => CATEGORY_ICONS[this.event().category]);
  protected readonly iconSize = computed(() => Math.round(this.size() * 0.55));
  protected readonly tone = computed(() => {
    switch (this.event().importance) {
      case 'HIGH':
        return 'bg-error-container text-on-error-container';
      case 'MEDIUM':
        return 'bg-secondary-container text-on-secondary-container';
      default:
        return 'bg-surface-container-highest text-on-surface-variant';
    }
  });
}
