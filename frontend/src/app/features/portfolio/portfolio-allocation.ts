import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ApiService } from '../../core/api/api.service';
import { T212AllocationItem } from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { StockLogo } from '../../shared/components/stock-logo/stock-logo';
import { Icon } from '../../shared/icon/icon';
import { PercentPipe } from '../../shared/pipes/format.pipes';
import { formatPercent, formatPlainPercent, toneClass, toneOf } from '../../shared/utils/format';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { AllocationDialog, AllocationDialogData } from './allocation-dialog';
import { displayTicker } from './portfolio-model';
import { PositionDialog, PositionDialogData } from './position-dialog';
import { squarify } from './treemap';

/** Tiles drawn for the largest positions; the rest share one "…" tile that opens the full list. */
const MAX_TILES = 9;
/** The "…" tile never gets smaller than this share, so it stays tappable. */
const MIN_OTHERS_PCT = 4;
/** The treemap's box: about the width of a phone card, a little taller than wide. */
const BOX_W = 310;
const BOX_H = 340;

interface Tile {
  item: T212AllocationItem | null;
  /** Percent of the box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** What fits: logo, ticker and change; ticker and change; ticker; nothing. */
  fit: 'full' | 'text' | 'ticker' | 'none';
}

/**
 * Portfolio → Overview: the open positions as a treemap (area = share of the value, colour = today's price change),
 * as in the Trading 212 app. A tile opens the position; the "…" tile lists every position in a dialog.
 * The card collapses to its title; the choice is remembered.
 */
@Component({
  selector: 'app-portfolio-allocation',
  imports: [StockLogo, Icon, PercentPipe],
  template: `
    @if (data.hasValue() && data.value().items.length) {
      <section class="app-card" aria-labelledby="allocation-title">
        <h2 class="m-0">
          <button
            type="button"
            id="allocation-title"
            class="-m-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-2xl p-2 text-left hover:bg-surface-container-high"
            [attr.aria-expanded]="expanded()"
            aria-controls="allocation-content"
            (click)="expanded.set(!expanded())"
          >
            <span class="app-label flex-1" i18n>Asset allocation</span>
            <app-icon
              name="keyboard_arrow_down"
              class="text-on-surface-variant transition-transform duration-200"
              [class.rotate-180]="expanded()"
            />
          </button>
        </h2>
        @if (expanded()) {
          <div id="allocation-content">
            <p class="mt-1 text-[13px] text-on-surface-variant" i18n>
              Each position's share of your portfolio and today's price change.
            </p>
            <div class="relative mt-3.5 aspect-[31/34] w-full" role="list">
              @for (t of tiles(); track t.item?.t212Ticker ?? 'others') {
                <div
                  class="absolute p-[2px]"
                  role="listitem"
                  [style.left.%]="t.x"
                  [style.top.%]="t.y"
                  [style.width.%]="t.w"
                  [style.height.%]="t.h"
                >
                  @if (t.item; as item) {
                    <button
                      type="button"
                      class="flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] px-1 text-center"
                      [class]="tileClass(item.dayChangePct)"
                      [attr.aria-label]="tileLabel(item)"
                      (click)="open(item)"
                    >
                      @if (t.fit === 'full') {
                        <app-stock-logo
                          class="mb-1"
                          [symbol]="ticker(item)"
                          [logoUrl]="item.logoUrl"
                          [size]="28"
                        />
                      }
                      @if (t.fit !== 'none') {
                        <span class="max-w-full truncate text-[13px] font-semibold">{{
                          ticker(item)
                        }}</span>
                      }
                      @if (t.fit === 'full' || t.fit === 'text') {
                        <span class="text-[12.5px] font-medium" [class]="tone(item.dayChangePct)">{{
                          item.dayChangePct | pct
                        }}</span>
                      }
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="flex size-full items-center justify-center rounded-[14px] bg-surface-container-high text-base font-bold tracking-widest text-on-surface-variant"
                      aria-label="Show all positions"
                      i18n-aria-label
                      aria-haspopup="dialog"
                      (click)="openAll()"
                    >
                      …
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class PortfolioAllocation {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly dialog = inject(MatDialog);

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);

  protected readonly expanded = persistedSignal('portfolio.allocation.expanded', true);

  protected readonly data = rxResource({
    params: () => ({ version: this.version() + this.t212.dataVersion() }),
    stream: () => this.api.t212Allocation(),
  });

  protected readonly tiles = computed((): Tile[] => {
    if (!this.data.hasValue()) return [];
    const items = this.data.value().items.filter((i) => i.weightPct > 0);
    const shown = items.slice(0, MAX_TILES);
    const rest = items.slice(MAX_TILES).reduce((sum, i) => sum + i.weightPct, 0);
    const entries: { item: T212AllocationItem | null; weight: number }[] = shown.map((item) => ({
      item,
      weight: item.weightPct,
    }));
    if (items.length > MAX_TILES)
      entries.push({ item: null, weight: Math.max(rest, MIN_OTHERS_PCT) });
    return squarify(entries, (e) => e.weight, BOX_W, BOX_H).map((r) => ({
      item: r.item.item,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      fit: fitOf((r.w / 100) * BOX_W, (r.h / 100) * BOX_H),
    }));
  });

  constructor() {
    // Prices change: refetch quietly every minute, keep showing the old values on failure.
    let seen = this.t212.liveTick();
    effect(() => {
      const tick = this.t212.liveTick();
      if (tick === seen) return;
      seen = tick;
      untracked(() => {
        firstValueFrom(this.api.t212Allocation({ force: true })).then(
          (value) => {
            if (this.data.hasValue()) this.data.set(value);
          },
          () => undefined,
        );
      });
    });
  }

  protected ticker(item: T212AllocationItem): string {
    return displayTicker(item);
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  protected tileClass(change: number | null): string {
    switch (toneOf(change)) {
      case 'gain':
        return 'bg-gain-container';
      case 'loss':
        return 'bg-loss-container';
      default:
        return 'bg-surface-container-high';
    }
  }

  protected share(item: T212AllocationItem): string {
    return formatPlainPercent(item.weightPct, 1);
  }

  protected tileLabel(item: T212AllocationItem): string {
    const ticker = this.ticker(item);
    const share = this.share(item);
    if (item.dayChangePct === null)
      return $localize`:Treemap tile; ticker, share of the portfolio:${ticker}:ticker:, ${share}:share: of the portfolio`;
    const change = formatPercent(item.dayChangePct);
    return $localize`:Treemap tile; ticker, share of the portfolio, today's change:${ticker}:ticker:, ${share}:share: of the portfolio, today ${change}:change:`;
  }

  protected openAll(): void {
    if (!this.data.hasValue()) return;
    this.dialog
      .open<AllocationDialog, AllocationDialogData, T212AllocationItem>(AllocationDialog, {
        data: { items: this.data.value().items },
        width: 'calc(100vw - 32px)',
        maxWidth: '32rem',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .subscribe((item) => {
        if (item) this.open(item);
      });
  }

  protected open(item: T212AllocationItem): void {
    this.dialog.open<PositionDialog, PositionDialogData>(PositionDialog, {
      data: { t212Ticker: item.t212Ticker },
      width: 'calc(100vw - 32px)',
      maxWidth: '32rem',
      autoFocus: 'dialog',
    });
  }
}

/** How much of a tile's content fits, by its size in pixels at a typical phone width. */
function fitOf(width: number, height: number): Tile['fit'] {
  if (width >= 60 && height >= 88) return 'full';
  if (width >= 52 && height >= 44) return 'text';
  if (width >= 40 && height >= 24) return 'ticker';
  return 'none';
}
