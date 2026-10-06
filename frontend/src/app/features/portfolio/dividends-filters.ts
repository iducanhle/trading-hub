import { Component, Signal, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatSelect, MatSelectTrigger } from '@angular/material/select';
import { Dialog } from '../../shared/components/dialog/dialog';
import { SortDirection, displayTicker } from './portfolio-model';
import { InstrumentOption } from './trades-filters';

/** Order of the Dividends list, with its direction on the toggle beside the Filters button. */
export type DividendSort = 'date' | 'amount';

export const DEFAULT_DIVIDEND_SORT: DividendSort = 'date';

export const DEFAULT_DIVIDEND_DIRECTION: SortDirection = 'desc';

export const DIVIDEND_SORTS: readonly DividendSort[] = ['date', 'amount'];

export const DIVIDEND_SORT_LABELS: Record<DividendSort, string> = {
  date: $localize`:Sort by:Date`,
  amount: $localize`:Sort by:Amount`,
};

/** What the sheet edits: the stocks (t212Tickers; empty = all) and the sort. */
export interface DividendsView {
  tickers: string[];
  sort: DividendSort;
}

export interface DividendsFilterContext {
  view: DividendsView;
  instruments: Signal<InstrumentOption[]>;
  change: (view: DividendsView) => void;
}

/** Stocks (multi-select) and sort of the Dividends list in a bottom sheet, as on the Trades tab; a draft until Done. */
@Component({
  selector: 'app-dividends-filter-sheet',
  imports: [Dialog, MatButton, MatFormField, MatLabel, MatSelect, MatSelectTrigger, MatOption],
  template: `
    <app-dialog title="Filters" i18n-title>
      <div class="flex flex-col gap-3">
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n>Stocks</mat-label>
          <mat-select
            multiple
            [value]="draft().tickers"
            (selectionChange)="patch({ tickers: $event.value })"
          >
            <mat-select-trigger>{{ summary() }}</mat-select-trigger>
            @for (option of options(); track option.t212Ticker) {
              <mat-option [value]="option.t212Ticker">
                <span class="font-medium">{{ ticker(option) }}</span>
                <span class="ml-2 text-on-surface-variant">{{ option.name }}</span>
              </mat-option>
            } @empty {
              <mat-option disabled i18n>No dividends in this period</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="fill" subscriptSizing="dynamic" class="w-full">
          <mat-label i18n>Sort</mat-label>
          <mat-select [value]="draft().sort" (selectionChange)="patch({ sort: $event.value })">
            @for (option of sorts; track option) {
              <mat-option [value]="option">{{ sortLabels[option] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <button dialogActions matButton="tonal" type="button" (click)="draft.set(defaults)">
        <ng-container i18n>Reset</ng-container>
      </button>
      <button dialogActions matButton="filled" type="button" (click)="done()">
        <ng-container i18n>Done</ng-container>
      </button>
    </app-dialog>
  `,
})
export class DividendsFilterSheet {
  private readonly context = inject<DividendsFilterContext>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DividendsFilterSheet>);

  protected readonly sorts = DIVIDEND_SORTS;
  protected readonly sortLabels = DIVIDEND_SORT_LABELS;
  protected readonly defaults: DividendsView = { tickers: [], sort: DEFAULT_DIVIDEND_SORT };
  protected readonly draft = signal<DividendsView>(this.context.view);

  /** Stocks that paid in the period, plus any selected ones outside it so they can be unselected. */
  protected readonly options = computed(() => {
    const instruments = this.context.instruments();
    const known = new Set(instruments.map((i) => i.t212Ticker));
    const extra = this.draft()
      .tickers.filter((t) => !known.has(t))
      .map((t212Ticker) => ({ t212Ticker, symbol: null, name: '' }));
    return [...instruments, ...extra];
  });

  protected readonly summary = computed(() => {
    const options = this.options();
    return this.draft()
      .tickers.map((t) => {
        const option = options.find((o) => o.t212Ticker === t);
        return option ? displayTicker(option) : t;
      })
      .join(', ');
  });

  protected ticker(option: InstrumentOption): string {
    return displayTicker(option);
  }

  protected patch(patch: Partial<DividendsView>): void {
    this.draft.update((view) => ({ ...view, ...patch }));
  }

  protected done(): void {
    this.context.change(this.draft());
    this.ref.close();
  }
}
