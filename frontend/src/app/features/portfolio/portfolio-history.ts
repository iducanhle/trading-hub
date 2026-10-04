import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
  MouseEventParams,
  Time,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts';
import { ApiService } from '../../core/api/api.service';
import {
  T212HistoryInterval,
  T212HistoryPoint,
  T212HistoryRange,
} from '../../core/models/contract';
import { T212Service } from '../../core/services/t212.service';
import { ThemeService } from '../../core/services/theme.service';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { HeroAmount } from '../../shared/components/hero-amount/hero-amount';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Icon } from '../../shared/icon/icon';
import { PercentPipe, PricePipe, SignedMoneyPipe } from '../../shared/pipes/format.pipes';
import { NUMBER_LOCALE, PERIOD_LABELS, toneClass } from '../../shared/utils/format';
import { APP_LOCALE } from '../../shared/utils/locale';
import { persistedSignal } from '../../shared/utils/persisted-signal';
import { readChartColors, withAlpha } from '../stock-detail/sections/price-chart/chart-colors';

const RANGES: T212HistoryRange[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

/** The intervals each range offers (the API's), default first. */
const INTERVALS: Record<T212HistoryRange, T212HistoryInterval[]> = {
  '1D': ['15m', '30m', '1h'],
  '1W': ['1h', '15m', '30m', '4h'],
  '1M': ['1h', '15m', '30m', '4h', '1d'],
  '3M': ['4h', '30m', '1h', '1d'],
  '1Y': ['1d', '1h', '4h', '1w'],
  ALL: ['1d', '1h', '4h', '1w'],
};
const ORDER: T212HistoryInterval[] = ['15m', '30m', '1h', '4h', '1d', '1w'];

const RANGE_LABELS: Record<T212HistoryRange, string> = {
  '1D': PERIOD_LABELS['1D'],
  '1W': PERIOD_LABELS['1W'],
  '1M': PERIOD_LABELS['1M'],
  '3M': PERIOD_LABELS['3M'],
  '1Y': PERIOD_LABELS['1Y'],
  ALL: $localize`:Chart range, the whole history:All`,
};

/** Compact interval codes, the same in every language (as on the price chart). */
const INTERVAL_LABELS: Record<T212HistoryInterval, string> = {
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

const amountFormat = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 });

/** Chart time of an ISO instant, shifted so the axis shows the device's local time. */
function chartTime(iso: string): UTCTimestamp {
  const ms = Date.parse(iso);
  return (ms / 1000 - new Date(ms).getTimezoneOffset() * 60) as UTCTimestamp;
}

/**
 * Portfolio → Overview: the account value and net deposits over time, from the snapshots the server stores every
 * 15 minutes (the gap between the lines is the profit). The header shows the latest point, or the touched one,
 * with its all-time profit/loss. Collapses to its title; the choice, range and interval are remembered.
 */
@Component({
  selector: 'app-portfolio-history',
  imports: [
    ErrorState,
    HeroAmount,
    Icon,
    PercentPipe,
    PricePipe,
    Segment,
    Segmented,
    SignedMoneyPipe,
    Skeleton,
  ],
  template: `
    <section class="app-card" aria-labelledby="history-title">
      <h2 class="m-0">
        <button
          type="button"
          id="history-title"
          class="-m-2 flex w-[calc(100%+16px)] items-center gap-2 rounded-2xl p-2 text-left hover:bg-surface-container-high"
          [attr.aria-expanded]="expanded()"
          aria-controls="history-content"
          (click)="expanded.set(!expanded())"
        >
          <span class="app-title-card flex-1" i18n="Card title: account value over time"
            >Account history</span
          >
          <app-icon
            name="keyboard_arrow_down"
            class="text-on-surface-variant transition-transform duration-200"
            [class.rotate-180]="expanded()"
          />
        </button>
      </h2>
      @if (expanded()) {
        <div id="history-content">
          @if (data.error() && !data.hasValue()) {
            <app-error-state class="mt-3 block" [error]="data.error()" (retry)="data.reload()" />
          } @else {
            <div class="mt-2 min-h-[88px]">
              @if (shown(); as p) {
                <p class="app-label">
                  @if (hovered()) {
                    {{ when(p.at) }}
                  } @else {
                    <ng-container i18n>Account value</ng-container>
                  }
                </p>
                <app-hero-amount class="mt-1" size="md" [value]="p.value" [currency]="currency()" />
                <p class="mt-1 text-[15px] font-semibold" [class]="tone(p.profit)">
                  {{ p.profit | money: currency() }}
                  @if (profitPct(p) !== null) {
                    <span class="font-medium">· {{ profitPct(p) | pct: 1 }}</span>
                  }
                  <span class="app-label ms-1" i18n="Profit since the first deposit">all time</span>
                </p>
              } @else if (!data.hasValue()) {
                <app-skeleton shape="card" class="block h-20" aria-hidden="true" />
              }
            </div>

            <div class="relative mt-2 h-56">
              <div #container class="size-full"></div>
              @if (data.hasValue() && points().length < 2) {
                <p
                  class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-on-surface-variant"
                  i18n
                >
                  History is being collected. A new point is added every 15 minutes.
                </p>
              }
            </div>

            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
              <span class="inline-flex items-center gap-1.5">
                <span class="h-0.5 w-3.5 rounded-full bg-primary" aria-hidden="true"></span>
                <ng-container i18n>Account value</ng-container>
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="w-3.5 border-t-2 border-dashed border-on-surface-variant"
                  aria-hidden="true"
                ></span>
                <ng-container i18n>Net deposits</ng-container>
                @if (shown()?.netDeposits; as deposits) {
                  <span class="font-semibold text-on-surface">{{
                    deposits | price: currency()
                  }}</span>
                }
              </span>
            </div>

            <div class="pt-3">
              <app-segmented
                appearance="chips"
                stretch
                aria-label="History range"
                i18n-aria-label
                [value]="range()"
                (valueChange)="setRange($any($event))"
              >
                @for (r of ranges; track r) {
                  <app-segment [value]="r">{{ rangeLabels[r] }}</app-segment>
                }
              </app-segmented>
            </div>
            <div class="flex justify-center pt-1.5">
              <app-segmented
                appearance="chips"
                aria-label="Interval"
                i18n-aria-label="History chart interval selector"
                [value]="interval()"
                (valueChange)="interval.set($any($event))"
              >
                @for (i of intervals(); track i) {
                  <app-segment [value]="i"
                    ><span class="inline-flex items-center gap-0.5 whitespace-nowrap"
                      ><app-icon name="timer" [size]="12" />{{ intervalLabels[i] }}</span
                    ></app-segment
                  >
                }
              </app-segmented>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class PortfolioHistory {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);
  private readonly theme = inject(ThemeService);
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  /** Goes up on pull-to-refresh / Retry. */
  readonly version = input(0);

  protected readonly expanded = persistedSignal('portfolio.history.expanded', true);
  protected readonly range = persistedSignal<T212HistoryRange>('portfolio.history.range', '1M');
  protected readonly interval = persistedSignal<T212HistoryInterval>(
    'portfolio.history.interval',
    '1h',
  );
  protected readonly ranges = RANGES;
  protected readonly rangeLabels = RANGE_LABELS;
  protected readonly intervalLabels = INTERVAL_LABELS;
  protected readonly intervals = computed(() =>
    ORDER.filter((i) => INTERVALS[this.range()].includes(i)),
  );

  protected readonly data = rxResource({
    params: () =>
      this.expanded()
        ? {
            range: this.range(),
            interval: this.validInterval(),
            version: this.version() + this.t212.dataVersion(),
          }
        : undefined,
    stream: ({ params }) => this.api.t212History(params.range, params.interval),
  });

  protected readonly points = computed(() =>
    this.data.hasValue() ? this.data.value().points : [],
  );
  protected readonly currency = computed(() =>
    this.data.hasValue() ? this.data.value().accountCurrency : null,
  );
  protected readonly hovered = signal<T212HistoryPoint | null>(null);
  protected readonly shown = computed(() => this.hovered() ?? this.points().at(-1) ?? null);

  private readonly container = viewChild<ElementRef<HTMLDivElement>>('container');
  private chart?: IChartApi;
  private value?: ISeriesApi<'Area'>;
  private deposits?: ISeriesApi<'Line'>;
  private byTime = new Map<number, T212HistoryPoint>();
  private readonly whenFormat = new Intl.DateTimeFormat(APP_LOCALE, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  constructor() {
    // The chart lives inside the collapsible content: create it when the container appears, drop it when it goes.
    effect(() => {
      const el = this.container()?.nativeElement;
      untracked(() => {
        if (el && !this.chart) this.createChart(el);
        if (!el && this.chart) this.removeChart();
      });
    });
    effect(() => {
      const points = this.points();
      this.container();
      this.theme.dark(); // re-read the colours when the theme changes
      untracked(() => this.render(points));
    });
    inject(DestroyRef).onDestroy(() => this.removeChart());
  }

  /** The stored interval, or the range's default when the range does not offer it. */
  private validInterval(): T212HistoryInterval {
    const offered = INTERVALS[this.range()];
    return offered.includes(this.interval()) ? this.interval() : offered[0];
  }

  protected setRange(range: T212HistoryRange): void {
    this.range.set(range);
    if (!INTERVALS[range].includes(this.interval())) this.interval.set(INTERVALS[range][0]);
    this.hovered.set(null);
  }

  protected when(iso: string): string {
    return this.whenFormat.format(new Date(iso));
  }

  protected tone(value: number | null): string {
    return toneClass(value);
  }

  /** All-time profit as a share of the net deposits; null without positive deposits. */
  protected profitPct(p: T212HistoryPoint): number | null {
    return p.profit !== null && p.netDeposits !== null && p.netDeposits > 0
      ? (p.profit / p.netDeposits) * 100
      : null;
  }

  private createChart(el: HTMLElement): void {
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily:
          "'App Numerals', 'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        // Required by the Lightweight Charts licence: keep the TradingView attribution.
        attributionLogo: true,
      },
      localization: {
        locale: NUMBER_LOCALE,
        priceFormatter: (price: number) => amountFormat.format(price),
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 0.05,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Magnet },
      // Vertical drags scroll the page; horizontal drags pan, two fingers zoom.
      handleScroll: { vertTouchDrag: false },
    });
    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      this.hovered.set(
        param.time && param.point ? (this.byTime.get(param.time as number) ?? null) : null,
      );
    });
    this.deposits = chart.addSeries(LineSeries, {
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    this.value = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerRadius: 4,
    });
    this.chart = chart;
  }

  private removeChart(): void {
    this.chart?.remove();
    this.chart = undefined;
    this.value = undefined;
    this.deposits = undefined;
    this.hovered.set(null);
  }

  private render(all: T212HistoryPoint[]): void {
    // Local-time shifting can repeat an hour when the clocks go back; the chart needs rising times.
    let last = -Infinity;
    const points = all.filter((p) => {
      const t = chartTime(p.at);
      if (t <= last) return false;
      last = t;
      return true;
    });
    const chart = this.chart;
    if (!chart || !this.value || !this.deposits) return;
    const colors = readChartColors(this.host);
    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.labelBackground },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.labelBackground },
      },
    });
    this.value.applyOptions({
      lineColor: colors.line,
      topColor: withAlpha(colors.line, 0.28),
      bottomColor: withAlpha(colors.line, 0),
    });
    this.deposits.applyOptions({ color: colors.text });

    this.byTime = new Map(points.map((p) => [chartTime(p.at), p]));
    this.value.setData(points.map((p) => ({ time: chartTime(p.at), value: p.value })));
    this.deposits.setData(
      points
        .filter((p) => p.netDeposits !== null)
        .map((p) => ({ time: chartTime(p.at), value: p.netDeposits as number })),
    );
    chart.timeScale().fitContent();
  }
}
