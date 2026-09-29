import { Component, input } from '@angular/core';
import { PageHeader } from '../../shared/components/page-header/page-header';

@Component({
  selector: 'app-stock-detail-page',
  imports: [PageHeader],
  template: `
    <app-page-header [title]="symbol()" [back]="true" />
    <p class="mx-auto max-w-2xl px-4 py-8 text-on-surface-variant">Coming in the next phase.</p>
  `,
})
export class StockDetailPage {
  readonly symbol = input.required<string>();
}
