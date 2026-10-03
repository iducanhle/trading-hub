import { Component, input, output } from '@angular/core';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { todayIso } from '../../shared/utils/dates';
import { PRESET_LABELS } from './portfolio-labels';
import {
  PERIOD_PRESETS,
  PeriodPreset,
  PortfolioPeriod,
  addCustomDefaults,
  presetRange,
} from './portfolio-model';

/** 1D · 1W · 1M · 3M · 6M · YTD · 1Y · All · Custom; Custom shows two date fields. Shared by all portfolio sub-tabs. */
@Component({
  selector: 'app-period-selector',
  imports: [Segmented, Segment],
  template: `
    <app-segmented
      appearance="chips"
      aria-label="Period"
      i18n-aria-label
      [value]="period().preset"
      (valueChange)="choose($event)"
    >
      @for (preset of presets; track preset) {
        <app-segment [value]="preset">{{ labels[preset] }}</app-segment>
      }
    </app-segmented>
    @if (period().preset === 'CUSTOM') {
      <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label class="flex items-center gap-2">
          <span class="text-on-surface-variant" i18n="Start of a date range">From</span>
          <input
            type="date"
            class="h-10 rounded-xl bg-surface-container px-3 font-semibold"
            [value]="period().from ?? ''"
            [max]="period().to ?? today"
            (change)="setDay('from', $event)"
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="text-on-surface-variant" i18n="End of a date range">To</span>
          <input
            type="date"
            class="h-10 rounded-xl bg-surface-container px-3 font-semibold"
            [value]="period().to ?? ''"
            [min]="period().from ?? ''"
            [max]="today"
            (change)="setDay('to', $event)"
          />
        </label>
      </div>
    }
  `,
})
export class PeriodSelector {
  readonly period = input.required<PortfolioPeriod>();
  readonly periodChange = output<PortfolioPeriod>();

  protected readonly presets = PERIOD_PRESETS;
  protected readonly labels = PRESET_LABELS;
  protected readonly today = todayIso();

  protected choose(preset: PeriodPreset): void {
    if (preset === this.period().preset) return;
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
