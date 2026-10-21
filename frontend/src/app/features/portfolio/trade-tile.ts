import { Component, booleanAttribute, computed, input } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { IconName } from '../../shared/icon/icon-paths';

export type TradeTileKind = 'buy' | 'sell' | 'transfer' | 'dividend';

const TILES: Record<TradeTileKind, { icon: IconName; classes: string }> = {
  buy: { icon: 'arrow_down', classes: 'bg-primary-container text-primary' },
  sell: { icon: 'arrow_up', classes: 'bg-on-surface/10 text-on-surface' },
  transfer: { icon: 'swap_vert', classes: 'bg-on-surface/10 text-on-surface-variant' },
  dividend: { icon: 'savings', classes: 'bg-gain-container text-gain' },
};

/** The square icon in front of a trade or dividend row: buys on the accent tint, sells on a neutral one. */
@Component({
  selector: 'app-trade-tile',
  imports: [Icon],
  template: `<app-icon [name]="tile().icon" [size]="small() ? 14 : 20" [strokeWidth]="2" />`,
  host: {
    class: 'flex shrink-0 items-center justify-center',
    '[class]': "tile().classes + (small() ? ' size-6 rounded-md' : ' size-10 rounded-xl')",
    'aria-hidden': 'true',
  },
})
export class TradeTile {
  readonly kind = input.required<TradeTileKind>();
  /** A 24 px tile for dense lists. */
  readonly small = input(false, { transform: booleanAttribute });
  protected readonly tile = computed(() => TILES[this.kind()]);
}
