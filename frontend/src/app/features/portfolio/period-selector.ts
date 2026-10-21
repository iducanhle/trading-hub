import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { DIALOG_CONFIG } from '../../shared/components/dialog/dialog';
import { Icon } from '../../shared/icon/icon';
import { todayIso } from '../../shared/utils/dates';
import { PRESET_LABELS } from './portfolio-labels';
import {
  PERIOD_PRESETS,
  PeriodPreset,
  PortfolioPeriod,
  addCustomDefaults,
  presetRange,
} from './portfolio-model';
import { PeriodRange, PeriodRangeDialog } from './period-range-dialog';

/** The presets offered in the row; the calendar (Custom) opens a dialog for the start and end day. */
const SHOWN: ReadonlySet<PeriodPreset> = new Set(['1D', '1W', '1M', '6M', 'YTD', 'ALL', 'CUSTOM']);

/**
 * One row of equally wide period segments: 1D · 1W · 1M · 6M · YTD · All · calendar. A preset left out of the row
 * (3M, 1Y from an older link) is still shown while it's the chosen one. A custom period shows as the first filter chip
 * of the tab (customPeriodLabel). Shared by all portfolio sub-tabs.
 */
@Component({
  selector: 'app-period-selector',
  imports: [Segmented, Segment, Icon],
  template: `
    <app-segmented
      stretch
      aria-label="Period"
      i18n-aria-label
      [value]="selection()"
      (valueChange)="choose($event)"
    >
      @for (preset of visible(); track preset) {
        @if (preset === 'CUSTOM') {
          <app-segment
            [value]="preset"
            [aria-label]="labels.CUSTOM"
            (click)="period().preset === 'CUSTOM' && openRange()"
          >
            <app-icon name="calendar_month" [size]="18" />
          </app-segment>
        } @else {
          <app-segment [value]="preset">{{ labels[preset] }}</app-segment>
        }
      }
    </app-segmented>
  `,
})
export class PeriodSelector {
  readonly period = input.required<PortfolioPeriod>();
  readonly periodChange = output<PortfolioPeriod>();

  private readonly dialog = inject(MatDialog);

  protected readonly labels = PRESET_LABELS;
  private readonly today = todayIso();

  /** The highlighted segment: the calendar while its dialog is open, otherwise the period's preset. */
  protected readonly selection = linkedSignal(() => this.period().preset);

  protected readonly visible = computed(() => {
    const chosen = this.period().preset;
    return PERIOD_PRESETS.filter((p) => SHOWN.has(p) || p === chosen);
  });

  protected choose(preset: PeriodPreset): void {
    this.selection.set(preset);
    if (preset === this.period().preset) return;
    if (preset === 'CUSTOM') {
      this.openRange();
    } else {
      this.periodChange.emit({ preset, ...presetRange(preset, this.today) });
    }
  }

  protected openRange(): void {
    const current = this.period();
    const start: PeriodRange =
      current.preset === 'CUSTOM' ? current : addCustomDefaults(current, this.today);
    this.dialog
      .open<PeriodRangeDialog, PeriodRange, PeriodRange>(PeriodRangeDialog, {
        ...DIALOG_CONFIG,
        data: { from: start.from, to: start.to },
        ariaLabel: $localize`:Title of the dialog choosing a date range:Custom period`,
      })
      .afterClosed()
      .subscribe((range) => {
        if (range) this.periodChange.emit({ preset: 'CUSTOM', ...range });
        // Cancelled: the calendar stops being highlighted unless the period already was custom.
        else this.selection.set(this.period().preset);
      });
  }
}
