import { Component, booleanAttribute, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchResult } from '../../core/models/contract';
import { FollowButton } from '../../shared/components/follow-button/follow-button';
import { RegionBadge } from '../../shared/components/region-badge/region-badge';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';

/**
 * One search result or recent search: logo, symbol, region, name, exchange; opens the stock page. `follow` adds a
 * star to follow or unfollow it right from the list.
 */
@Component({
  selector: 'app-stock-row',
  imports: [RouterLink, StockLogo, RegionBadge, FollowButton],
  host: { class: 'flex items-center' },
  template: `
    <a
      [routerLink]="['/stock', stock().symbol]"
      class="-mx-1 flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl px-1 py-[13px] hover:bg-surface-container-high focus-visible:bg-surface-container-high"
    >
      <app-stock-logo [symbol]="stock().symbol" [logoUrl]="stock().logoUrl" [size]="48" />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="app-row-title">{{ stock().symbol }}</span>
          <app-region-badge [region]="stock().region" />
        </span>
        <span class="block truncate app-row-meta">{{ stock().name }}</span>
      </span>
      <span
        class="max-w-[35%] truncate text-right text-[13px] font-semibold text-on-surface-variant"
        >{{ stock().exchange }}</span
      >
    </a>
    @if (follow()) {
      <app-follow-button compact class="-mr-2 text-on-surface-variant" [target]="stock()" />
    }
  `,
})
export class StockRow {
  readonly stock = input.required<SearchResult>();
  readonly follow = input(false, { transform: booleanAttribute });
}
