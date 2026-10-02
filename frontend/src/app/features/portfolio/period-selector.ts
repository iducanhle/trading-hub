import { Component, input, output } from '@angular/core';
import { MatChipListbox, MatChipListboxChange, MatChipOption } from '@angular/material/chips';
import { todayIso } from '../../shared/utils/dates';
import { PRESET_LABELS } from './portfolio-labels';
import {
  PERIOD_PRESETS,
  PeriodPreset,
  PortfolioPeriod,
  addCustomDefaults,
  presetRange,
} from './portfolio-model';

/** 1M · 3M · YTD · 1Y · All · Custom; Custom shows two date fields. Shared by all portfolio sub-tabs. */
@Component({
  selector: 'app-period-selector',
  imports: [MatChipListbox, MatChipOption],
  template: `
    <mat-chip-listbox
      aria-label="Period"
      i18n-aria-label
      hideSingleSelectionIndicator
      class="period-chips"
      [value]="period().preset"
      (change)="choose($event)"
    >
      @for (preset of presets; track preset) {
        <mat-chip-option [value]="preset" [selectable]="period().preset !== preset">{{
          labels[preset]
        }}</mat-chip-option>
      }
    </mat-chip-listbox>
    @if (period().preset === 'CUSTOM') {
      <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label class="flex items-center gap-2">
          <span class="text-on-surface-variant" i18n="Start of a date range">From</span>
          <input
            type="date"
            class="rounded-lg border border-outline-variant bg-surface px-2 py-1"
            [value]="period().from ?? ''"
            [max]="period().to ?? today"
            (change)="setDay('from', $event)"
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="text-on-surface-variant" i18n="End of a date range">To</span>
          <input
            type="date"
            class="rounded-lg border border-outline-variant bg-surface px-2 py-1"
            [value]="period().to ?? ''"
            [min]="period().from ?? ''"
            [max]="today"
            (change)="setDay('to', $event)"
          />
        </label>
      </div>
    }
  `,
  styles: `
    .period-chips {
      --mdc-chip-container-height: 32px;
    }
  `,
})
export class PeriodSelector {
  readonly period = input.required<PortfolioPeriod>();
  readonly periodChange = output<PortfolioPeriod>();

  protected readonly presets = PERIOD_PRESETS;
  protected readonly labels = PRESET_LABELS;
  protected readonly today = todayIso();

  protected choose(event: MatChipListboxChange): void {
    const preset = event.value as PeriodPreset | undefined;
    if (!preset || preset === this.period().preset) return;
    if (preset === 'CUSTOM') {
      this.periodChange.emit(addCustomDefaults(this.period(), this.today));
    } else {
      this.periodChange.emit({ preset, ...presetRange(preset, this.today) });
    }
  }

  protected setDay(which: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value || null;
    const next = { ...this.period(), [which]: value };
    if (next.from && next.to && next.from > next.to) return;
    this.periodChange.emit(next);
  }
}
