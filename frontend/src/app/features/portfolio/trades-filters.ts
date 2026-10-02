import { Component, Signal, computed, inject, input, linkedSignal } from '@angular/core';
import { MatAutocomplete, MatAutocompleteTrigger, MatOption } from '@angular/material/autocomplete';
import { MatButton } from '@angular/material/button';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { T212Side } from '../../core/models/contract';
import { displayTicker } from './portfolio-model';

export interface TradeFilters {
  side: T212Side | null;
  /** A t212Ticker. */
  ticker: string | null;
}

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

/** Side (all / buy / sell) and one instrument, picked with an autocomplete; changes apply at once. */
@Component({
  selector: 'app-trades-filter-controls',
  imports: [
    MatButtonToggleGroup,
    MatButtonToggle,
    MatFormField,
    MatLabel,
    MatInput,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatOption,
  ],
  template: `
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        aria-label="Trade side"
        i18n-aria-label
        [value]="context().filters().side ?? 'ALL'"
        (change)="setSide($event.value)"
      >
        <mat-button-toggle value="ALL" i18n="All trades">All</mat-button-toggle>
        <mat-button-toggle value="BUY" i18n="Trade direction|Kind of trade">Buy</mat-button-toggle>
        <mat-button-toggle value="SELL" i18n="Trade direction|Kind of trade"
          >Sell</mat-button-toggle
        >
      </mat-button-toggle-group>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-full lg:w-72">
        <mat-label i18n>Stock</mat-label>
        <input
          matInput
          type="text"
          autocomplete="off"
          [matAutocomplete]="auto"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <mat-autocomplete
          #auto="matAutocomplete"
          [displayWith]="display"
          (optionSelected)="setTicker($event.option.value)"
        >
          @for (option of matches(); track option.t212Ticker) {
            <mat-option [value]="option">
              <span class="font-medium">{{ ticker(option) }}</span>
              <span class="ml-2 text-on-surface-variant">{{ option.name }}</span>
            </mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>
    </div>
  `,
})
export class TradesFilterControls {
  readonly context = input.required<TradeFiltersContext>();

  /** The text in the instrument field; follows the selected instrument. */
  protected readonly query = linkedSignal(() => {
    const ticker = this.context().filters().ticker;
    const option = this.context()
      .instruments()
      .find((i) => i.t212Ticker === ticker);
    return option ? this.display(option) : '';
  });
  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.context()
      .instruments()
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          displayTicker(i).toLowerCase().includes(q) ||
          i.t212Ticker.toLowerCase().includes(q),
      )
      .slice(0, 20);
  });

  protected readonly display = (option: InstrumentOption | string | null): string =>
    !option
      ? ''
      : typeof option === 'string'
        ? option
        : `${displayTicker(option)} · ${option.name}`;

  protected ticker(option: InstrumentOption): string {
    return displayTicker(option);
  }

  protected setSide(value: T212Side | 'ALL'): void {
    this.context().change({ ...this.context().filters(), side: value === 'ALL' ? null : value });
  }

  protected setTicker(option: InstrumentOption): void {
    this.context().change({ ...this.context().filters(), ticker: option.t212Ticker });
  }
}

/** Phone filters in a bottom sheet, like the events filters. */
@Component({
  selector: 'app-trades-filter-sheet',
  imports: [MatButton, TradesFilterControls],
  template: `
    <div class="px-4 pb-safe">
      <div
        class="mx-auto mt-1 mb-3 h-1 w-8 rounded-full bg-outline-variant"
        aria-hidden="true"
      ></div>
      <h2 class="mb-4 text-lg font-semibold" i18n>Filters</h2>
      <app-trades-filter-controls [context]="context" />
      <div class="mt-6 mb-4 flex justify-between gap-3">
        <button matButton type="button" (click)="reset()" i18n>Reset</button>
        <button matButton="filled" type="button" (click)="ref.dismiss()" i18n>Done</button>
      </div>
    </div>
  `,
})
export class TradesFilterSheet {
  protected readonly context = inject<TradeFiltersContext>(MAT_BOTTOM_SHEET_DATA);
  protected readonly ref = inject(MatBottomSheetRef<TradesFilterSheet>);

  protected reset(): void {
    this.context.change({ side: null, ticker: null });
  }
}
