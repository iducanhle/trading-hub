import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SearchResult } from '../../core/models/contract';
import { RegionBadge } from '../../shared/components/region-badge/region-badge';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';

/** One search result or recent search: logo, symbol, region, name, exchange; opens the stock page. */
@Component({
  selector: 'app-stock-row',
  imports: [RouterLink, StockLogo, RegionBadge],
  template: `
    <a
      [routerLink]="['/stock', stock().symbol]"
      class="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-container-high focus-visible:bg-surface-container-high"
    >
      <app-stock-logo [symbol]="stock().symbol" [logoUrl]="stock().logoUrl" [size]="40" />
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2">
          <span class="font-semibold">{{ stock().symbol }}</span>
          <app-region-badge [region]="stock().region" />
        </span>
        <span class="block truncate text-sm text-on-surface-variant">{{ stock().name }}</span>
      </span>
      <span class="max-w-[35%] truncate text-right text-xs text-on-surface-variant">{{ stock().exchange }}</span>
    </a>
  `,
})
export class StockRow {
  readonly stock = input.required<SearchResult>();
}
