import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api/api.service';
import { T212Holding, T212HoldingPosition } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { PricePipe, QuantityPipe } from '../../shared/pipes/format.pipes';
import { Pnl } from './pnl';
import { displayTicker } from './portfolio-model';
import { PositionDialog, PositionDialogData } from './position-dialog';

/**
 * Open positions as Trading 212 lists them, largest value first. A pie is one row; tapping it expands its
 * instruments in place. Tapping a position opens its chart and profit/loss in a dialog.
 */
@Component({
  selector: 'app-portfolio-holdings',
  imports: [NgTemplateOutlet, ErrorState, Skeleton, StockLogo, Icon, PricePipe, QuantityPipe, Pnl],
  template: `
    <h2 class="mt-6 mb-2 text-sm font-semibold text-on-surface-variant" i18n>Open positions</h2>
    @if (data.error() && !data.hasValue()) {
      <app-error-state [error]="data.error()" (retry)="data.reload()" />
    } @else if (!data.hasValue()) {
      <div class="space-y-2" aria-hidden="true">
        @for (i of [1, 2, 3, 4]; track i) {
          <app-skeleton shape="card" class="block h-14" />
        }
      </div>
    } @else {
      @let d = data.value();
      @if (!d.items.length) {
        <p class="text-center text-sm text-on-surface-variant" i18n>No open positions.</p>
      }
      <ul class="space-y-1">
        @for (h of d.items; track key(h)) {
          <li>
            @if (h.kind === 'PIE') {
              @let pie = h.pie;
              @let open = expanded().has(key(h));
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface-container-high"
                [attr.aria-expanded]="open"
                [attr.aria-controls]="'pie-' + key(h)"
                (click)="toggle(key(h))"
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"
                >
                  <app-icon name="pie_chart" [size]="20" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">
                    @if (pie.name) {
                      {{ pie.name }}
                    } @else {
                      <ng-container i18n="Trading 212 pie without a known name">Pie</ng-container>
                    }
                  </span>
                  <span
                    class="block text-xs text-on-surface-variant"
                    i18n
                    >{pie.positions.length, plural,
                      =1 {1 holding}
                      other {{{pie.positions.length}} holdings}
                    }</span
                  >
                </span>
                <ng-container
                  [ngTemplateOutlet]="amounts"
                  [ngTemplateOutletContext]="{
                    value: pie.value,
                    pnl: pie.pnl,
                    pct: pie.pnlPct,
                    currency: d.accountCurrency,
                  }"
                />
                <app-icon
                  name="keyboard_arrow_down"
                  [size]="20"
                  class="shrink-0 text-on-surface-variant transition-transform"
                  [class.rotate-180]="open"
                />
              </button>
              @if (open) {
                <ul
                  [id]="'pie-' + key(h)"
                  class="mt-1 ml-7 space-y-1 border-l border-outline-variant pl-2"
                >
                  @for (p of pie.positions; track p.t212Ticker) {
                    <li>
                      <ng-container
                        [ngTemplateOutlet]="row"
                        [ngTemplateOutletContext]="{ $implicit: p, currency: d.accountCurrency }"
                      />
                    </li>
                  }
                </ul>
              }
            } @else {
              <ng-container
                [ngTemplateOutlet]="row"
                [ngTemplateOutletContext]="{ $implicit: h.position, currency: d.accountCurrency }"
              />
            }
          </li>
        }
      </ul>
      @if (!d.piesAvailable) {
        <p class="mt-2 text-xs text-on-surface-variant" i18n>
          Trading 212 did not return the pies, so everything held in pies is shown as one pie.
        </p>
      }
    }

    <ng-template #row let-p let-currency="currency">
      <button
        type="button"
        class="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-surface-container-high"
        (click)="openPosition(p)"
      >
        <app-stock-logo [symbol]="ticker(p)" [logoUrl]="p.logoUrl" [size]="36" />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ p.name }}</span>
          <span class="block truncate text-xs text-on-surface-variant"
            >{{ p.quantity | qty }} {{ ticker(p) }}</span
          >
        </span>
        <ng-container
          [ngTemplateOutlet]="amounts"
          [ngTemplateOutletContext]="{ value: p.value, pnl: p.pnl, pct: p.pnlPct, currency }"
        />
      </button>
    </ng-template>

    <ng-template #amounts let-value="value" let-pnl="pnl" let-pct="pct" let-currency="currency">
      <span class="flex shrink-0 flex-col items-end text-right">
        <span class="font-medium tabular-nums">{{ value | price: currency }}</span>
        <app-pnl class="text-sm" [value]="pnl" [currency]="currency" [pct]="pct" />
      </span>
    </ng-template>
  `,
})
export class PortfolioHoldings {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly data = rxResource({
    params: () => ({ version: this.version() + this.t212.dataVersion() }),
    stream: () => this.api.t212Holdings(),
  });

  constructor() {
    // Positions change with prices: refetch quietly every minute, keep showing the old value on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        firstValueFrom(this.api.t212Holdings({ force: true })).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }

  protected key(h: T212Holding): string {
    return h.kind === 'PIE' ? `pie-${h.pie.id ?? 'grouped'}` : h.position.t212Ticker;
  }

  protected toggle(key: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected openPosition(p: T212HoldingPosition): void {
    this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
      data: { t212Ticker: p.t212Ticker },
      width: 'calc(100vw - 32px)',
      maxWidth: '32rem',
      autoFocus: 'dialog',
    });
  }

  protected ticker(p: T212HoldingPosition): string {
    return displayTicker(p);
  }
}
