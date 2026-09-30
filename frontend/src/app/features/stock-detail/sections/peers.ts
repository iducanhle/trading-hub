import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api/api.service';
import { ErrorState } from '../../../shared/components/error-state/error-state';
import { Section } from '../../../shared/components/section/section';
import { Skeleton } from '../../../shared/components/skeleton/skeleton';
import { StockLogo } from '../../../shared/components/stock-logo/stock-logo';
import { persistedSignal } from '../../../shared/utils/persisted-signal';
import { StockContext } from '../stock-context';

/** Section 12: similar stocks as a scrollable row of chips (hidden when there are none). */
@Component({
  selector: 'app-peers',
  imports: [RouterLink, Section, ErrorState, Skeleton, StockLogo],
  template: `
    @if (!peers.hasValue() || items().length) {
      <app-section title="Peers" i18n-title="Comparable companies" [(expanded)]="expanded">
        @if (peers.error()) {
          <app-error-state compact [error]="peers.error()" (retry)="peers.reload()" />
        } @else {
          <ul class="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            @if (!peers.hasValue()) {
              @for (i of [1, 2, 3, 4]; track i) {
                <li><app-skeleton class="h-11 w-24 rounded-full!" /></li>
              }
            }
            @for (peer of items(); track peer.symbol) {
              <li class="shrink-0">
                <a
                  [routerLink]="['/stock', peer.symbol]"
                  class="flex h-11 items-center gap-2 rounded-full border border-outline-variant pr-4 pl-1.5 text-sm font-medium hover:bg-surface-container-high"
                  [attr.aria-label]="peer.symbol + ', ' + peer.name"
                >
                  <app-stock-logo [symbol]="peer.symbol" [logoUrl]="peer.logoUrl" [size]="30" />
                  {{ peer.symbol }}
                </a>
              </li>
            }
          </ul>
        }
      </app-section>
    }
  `,
})
export class Peers {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);

  protected readonly expanded = persistedSignal('et.section.peers', true);
  protected readonly peers = this.ctx.resource(
    (symbol, options) => this.api.peers(symbol, options),
    () => this.expanded(),
  );
  protected readonly items = computed(() =>
    this.peers.hasValue() ? (this.peers.value() ?? []) : [],
  );
}
