import { Component, Signal, computed, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatSelect, MatSelectTrigger } from '@angular/material/select';
import { T212Side } from '../../core/models/contract';
import { displayTicker } from './portfolio-model';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { Sheet } from '../../shared/components/sheet/sheet';

export interface TradeFilters {
  side: T212Side | null;
  /** t212Tickers; empty = all stocks. */
  tickers: string[];
}

export const NO_TRADE_FILTERS: TradeFilters = { side: null, tickers: [] };

export interface InstrumentOption {
  t212Ticker: string;
  symbol: string | null;
  name: string;
}

export interface TradeFiltersContext {
  filters: Signal<TradeFilters>;
  instruments: Signal<InstrumentOption[]>;
  change: (filters: TradeFilters) => void;
}

/** Side (all / buy / sell) and any stocks traded in the period (multi-select). */
@Component({
  selector: 'app-trades-filter-controls',
  imports: [Segmented, Segment, MatFormField, MatLabel, MatSelect, MatSelectTrigger, MatOption],
  template: `
    <div class="flex flex-col gap-3">
      <app-segmented
        aria-label="Trade side"
        i18n-aria-label
        inset
        stretch
        [value]="side()"
        (valueChange)="setSide($event)"
      >
        <app-segment value="ALL" i18n="All trades">All</app-segment>
        <app-segment value="BUY" i18n="Trade direction|Kind of trade">Buy</app-segment>
        <app-segment value="SELL" i18n="Trade direction|Kind of trade">Sell</app-segment>
      </app-segmented>
      <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
        <mat-label i18n>Stocks</mat-label>
        <mat-select
          multiple
          [value]="filters().tickers"
          (selectionChange)="setTickers($event.value)"
        >
          <mat-select-trigger>{{ summary() }}</mat-select-trigger>
          @for (option of options(); track option.t212Ticker) {
            <mat-option [value]="option.t212Ticker">
              <span class="font-medium">{{ ticker(option) }}</span>
              <span class="ml-2 text-on-surface-variant">{{ option.name }}</span>
            </mat-option>
          } @empty {
            <mat-option disabled i18n>No trades in this period</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>
  `,
})
export class TradesFilterControls {
  readonly filters = input.required<TradeFilters>();
  readonly instruments = input.required<InstrumentOption[]>();
  readonly filtersChange = output<TradeFilters>();

  protected readonly side = computed<T212Side | 'ALL'>(() => this.filters().side ?? 'ALL');

  /** Stocks traded in the period, plus any selected ones outside it so they can be unselected. */
  protected readonly options = computed(() => {
    const instruments = this.instruments();
    const known = new Set(instruments.map((i) => i.t212Ticker));
    const extra = this.filters()
      .tickers.filter((t) => !known.has(t))
      .map((t212Ticker) => ({ t212Ticker, symbol: null, name: '' }));
    return [...instruments, ...extra];
  });

  protected readonly summary = computed(() => {
    const options = this.options();
    return this.filters()
      .tickers.map((t) => {
        const option = options.find((o) => o.t212Ticker === t);
        return option ? displayTicker(option) : t;
      })
      .join(', ');
  });

  protected ticker(option: InstrumentOption): string {
    return displayTicker(option);
  }

  protected setSide(value: T212Side | 'ALL'): void {
    this.filtersChange.emit({ ...this.filters(), side: value === 'ALL' ? null : value });
  }

  protected setTickers(tickers: string[]): void {
    this.filtersChange.emit({ ...this.filters(), tickers });
  }
}

/** Trade filters in a bottom sheet; changes are a draft until Done (closing the sheet otherwise discards them). */
@Component({
  selector: 'app-trades-filter-sheet',
  imports: [Sheet, MatButton, TradesFilterControls],
  template: `
    <app-sheet title="Filters" i18n-title>
      <app-trades-filter-controls
        [filters]="draft()"
        [instruments]="context.instruments()"
        (filtersChange)="draft.set($event)"
      />
      <button sheetActions matButton="tonal" type="button" (click)="draft.set(empty)">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button sheetActions matButton="filled" type="button" (click)="done()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-sheet>
  `,
})
export class TradesFilterSheet {
  protected readonly context = inject<TradeFiltersContext>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject(MatBottomSheetRef<TradesFilterSheet>);

  protected readonly empty = NO_TRADE_FILTERS;
  protected readonly draft = signal<TradeFilters>(this.context.filters());

  protected done(): void {
    const draft = this.draft();
    const current = this.context.filters();
    const same =
      draft.side === current.side &&
      draft.tickers.length === current.tickers.length &&
      draft.tickers.every((t) => current.tickers.includes(t));
    if (!same) this.context.change(draft);
    this.ref.dismiss();
  }
}
