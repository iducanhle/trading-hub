import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineSeries,
  MouseEventParams,
  Time,
  createChart,
} from 'lightweight-charts';
import { ApiService } from '../../../../core/api/api.service';
import { EarningsMarker, PriceBar, PriceRange, PricesResponse } from '../../../../core/models/contract';
import { ThemeService } from '../../../../core/services/theme.service';
import { Change } from '../../../../shared/components/change/change';
import { ErrorState } from '../../../../shared/components/error-state/error-state';
import { ResultBadge } from '../../../../shared/components/result-badge/result-badge';
import { Skeleton } from '../../../../shared/components/skeleton/skeleton';
import { StaleChip } from '../../../../shared/components/stale-chip/stale-chip';
import { Icon } from '../../../../shared/icon/icon';
import {
  AppDatePipe,
  CompactPipe,
  NumberPipe,
  PricePipe,
  RelativeDayPipe,
  ReportTimePipe,
} from '../../../../shared/pipes/format.pipes';
import { NUMBER_LOCALE } from '../../../../shared/utils/format';
import { persistedSignal } from '../../../../shared/utils/persisted-signal';
import { StockContext } from '../../stock-context';
import { readChartColors, withAlpha } from './chart-colors';
import { ChartType, futureSessions, placeMarkers } from './chart-data';
import { EarningsMarkersPrimitive } from './earnings-markers';

const RANGES: PriceRange[] = ['1W', '1M', '6M', '1Y', '5Y'];

interface LegendBar extends PriceBar {
  /** Percent change from the previous close. */
  change: number | null;
}

function timeKey(time: Time): string {
  if (typeof time === 'string') return time;
  if (typeof time === 'number') return new Date(time * 1000).toISOString().slice(0, 10);
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

const priceFormat = new Intl.NumberFormat(NUMBER_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Section 4: line or candlestick chart of daily bars with volume, earnings markers on the reaction days, a touch
 * crosshair legend (date, OHLC or close, volume), pinch/drag zoom within the loaded range, and theme-aware colours.
 */
@Component({
  selector: 'app-price-chart',
  imports: [
    MatButtonToggleGroup,
    MatButtonToggle,
    MatIconButton,
    Icon,
    Change,
    ErrorState,
    ResultBadge,
    Skeleton,
    StaleChip,
    AppDatePipe,
    CompactPipe,
    NumberPipe,
    PricePipe,
    RelativeDayPipe,
    ReportTimePipe,
  ],
  template: `
    <section class="border-t border-outline-variant pt-3 pb-2" aria-labelledby="price-chart-title">
      <h2 id="price-chart-title" class="sr-only">Price chart</h2>
      <div class="flex flex-wrap items-center justify-between gap-2 px-4">
        <div class="flex rounded-full bg-surface-container-high p-1" role="group" aria-label="Chart range">
          @for (r of ranges; track r) {
            <button
              type="button"
              class="h-9 min-w-10 rounded-full px-1.5 text-sm font-medium transition-colors"
              [class.bg-surface]="range() === r"
              [class.text-on-surface]="range() === r"
              [class.shadow-sm]="range() === r"
              [class.text-on-surface-variant]="range() !== r"
              [attr.aria-pressed]="range() === r"
              (click)="setRange(r)"
            >
              {{ r }}
            </button>
          }
        </div>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          aria-label="Chart type"
          [value]="type()"
          (change)="setType($event.value)"
        >
          <mat-button-toggle value="line" aria-label="Line" title="Line">
            <app-icon name="show_chart" [size]="20" class="align-middle" />
          </mat-button-toggle>
          <mat-button-toggle value="candles" aria-label="Candles" title="Candles">
            <app-icon name="candlestick_chart" [size]="20" class="align-middle" />
          </mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <div class="flex min-h-9 flex-wrap items-center gap-x-3 px-4 pt-2 text-xs tabular-nums text-on-surface-variant">
        @if (legend(); as bar) {
          <span class="font-medium text-on-surface">{{ bar.date | appDate: 'medium' }}</span>
          @if (type() === 'candles') {
            <span>O {{ bar.open | num }}</span>
            <span>H {{ bar.high | num }}</span>
            <span>L {{ bar.low | num }}</span>
            <span class="text-on-surface">C {{ bar.close | num }}</span>
          } @else {
            <span class="text-sm font-medium text-on-surface">{{ bar.close | price: currency() }}</span>
          }
          <app-change [value]="bar.change" />
          <span>Vol {{ bar.volume | compact }}</span>
        }
      </div>

      <div class="relative h-72 touch-pan-y sm:h-80 lg:h-96">
        <div #container class="absolute inset-0"></div>

        @if (prices.error() && !data()) {
          <div class="absolute inset-0 flex items-center justify-center bg-surface p-4">
            <app-error-state compact [error]="prices.error()" (retry)="prices.reload()" />
          </div>
        } @else if (!data()) {
          <app-skeleton shape="card" class="absolute inset-x-4 inset-y-2" />
        } @else if (!data()!.bars.length) {
          <p class="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant">
            No prices for this period.
          </p>
        }
        @if (prices.isLoading() && data()) {
          <div class="absolute top-2 right-4 size-2 animate-ping rounded-full bg-primary" aria-hidden="true"></div>
        }

        @if (selected(); as marker) {
          <div
            class="absolute top-2 right-2 left-2 z-10 rounded-2xl bg-surface-container-highest p-3 text-sm shadow-lg sm:left-auto sm:w-72"
            role="dialog"
            aria-label="Earnings details"
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="font-semibold">
                  {{ marker.result === 'UPCOMING' ? 'Upcoming earnings' : 'Earnings' }} ·
                  {{ marker.reportDate | appDate: 'medium' }}
                </p>
                <p class="text-xs text-on-surface-variant">
                  {{ marker.time | reportTime }}
                  @if (selectedQuarter()?.timeAssumed) {
                    <span>(assumed)</span>
                  }
                  @if (marker.result === 'UPCOMING') {
                    · {{ marker.reportDate | relativeDay }}
                  }
                </p>
              </div>
              <app-result-badge [result]="marker.result" />
              <button matIconButton type="button" class="-mt-2 -mr-2" aria-label="Close" (click)="selected.set(null)">
                <app-icon name="close" [size]="20" />
              </button>
            </div>
            <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
              @if (marker.result === 'UPCOMING') {
                <dt class="text-on-surface-variant">EPS estimate</dt>
                <dd>{{ upcomingEstimate() | price: currency() }}</dd>
              } @else {
                <dt class="text-on-surface-variant">EPS est. → actual</dt>
                <dd>
                  {{ selectedQuarter()?.eps?.estimate | price: currency() }} →
                  {{ selectedQuarter()?.eps?.actual | price: currency() }}
                </dd>
                <dt class="text-on-surface-variant">Surprise</dt>
                <dd><app-change [value]="marker.epsSurprisePercent" /></dd>
              }
            </dl>
          </div>
        }
      </div>
      @if (data()?.stale) {
        <div class="px-4 pt-2"><app-stale-chip [asOf]="data()!.asOf" /></div>
      }
    </section>
  `,
})
export class PriceChart {
  private readonly ctx = inject(StockContext);
  private readonly api = inject(ApiService);
  private readonly theme = inject(ThemeService);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  protected readonly ranges = RANGES;
  protected readonly range = signal<PriceRange>('6M');
  protected readonly type = persistedSignal<ChartType>('et.chartType', 'line');

  protected readonly prices = rxResource({
    params: () =>
      this.ctx.symbol() ? { symbol: this.ctx.symbol(), range: this.range(), version: this.ctx.version() } : undefined,
    stream: ({ params }) => this.api.prices(params.symbol, params.range, { force: params.version > 0 }),
  });
  /** For the marker card; the same cached request the earnings sections use. */
  private readonly earnings = this.ctx.resource((symbol, options) => this.api.earnings(symbol, options));

  protected readonly data = computed<PricesResponse | undefined>(() =>
    this.prices.hasValue() ? this.prices.value() : undefined,
  );
  protected readonly currency = computed(() => this.data()?.currency ?? null);
  protected readonly hovered = signal<LegendBar | null>(null);
  protected readonly selected = signal<EarningsMarker | null>(null);

  private readonly legendBars = computed(() => {
    const bars = this.data()?.bars ?? [];
    return new Map(
      bars.map((bar, i): [string, LegendBar] => [
        bar.date,
        { ...bar, change: i > 0 ? ((bar.close - bars[i - 1].close) / bars[i - 1].close) * 100 : null },
      ]),
    );
  });
  protected readonly legend = computed(() => {
    const bars = this.data()?.bars;
    return this.hovered() ?? (bars?.length ? (this.legendBars().get(bars[bars.length - 1].date) ?? null) : null);
  });

  protected readonly selectedQuarter = computed(() => {
    const marker = this.selected();
    const earnings = this.earnings.hasValue() ? this.earnings.value() : undefined;
    return marker ? earnings?.quarters.find((q) => q.date === marker.reportDate) : undefined;
  });
  protected readonly upcomingEstimate = computed(() => {
    const earnings = this.earnings.hasValue() ? this.earnings.value() : undefined;
    return earnings?.upcoming?.epsEstimate ?? null;
  });

  private chart?: IChartApi;
  private main?: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
  private mainType?: ChartType;
  private volume?: ISeriesApi<'Histogram'>;
  private readonly markers = new EarningsMarkersPrimitive();
  private readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      this.createChart();
      this.ready.set(true);
    });
    effect(() => {
      const data = this.data();
      const type = this.type();
      this.theme.dark(); // re-read the colours when the theme changes
      if (this.ready()) untracked(() => this.render(data, type));
    });
    inject(DestroyRef).onDestroy(() => this.chart?.remove());
  }

  protected setRange(range: PriceRange): void {
    this.range.set(range);
    this.selected.set(null);
  }

  protected setType(type: ChartType): void {
    this.type.set(type);
    this.selected.set(null);
  }

  private createChart(): void {
    const chart = createChart(this.container().nativeElement, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        // Required by the Lightweight Charts licence: keep the TradingView attribution.
        attributionLogo: true,
      },
      localization: { locale: NUMBER_LOCALE, priceFormatter: (price: number) => priceFormat.format(price) },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 0.1,
      },
      crosshair: { mode: CrosshairMode.Magnet },
      // Vertical drags scroll the page; horizontal drags pan, two fingers zoom.
      handleScroll: { vertTouchDrag: false },
    });
    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      this.hovered.set(param.time && param.point ? (this.legendBars().get(timeKey(param.time)) ?? null) : null);
    });
    chart.subscribeClick((param: MouseEventParams<Time>) => {
      const marker = param.point ? this.markers.markerAt(param.point.x, param.point.y) : null;
      this.selected.set(marker?.data ?? null);
    });
    this.volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    this.chart = chart;
  }

  private render(data: PricesResponse | undefined, type: ChartType): void {
    const chart = this.chart;
    const volume = this.volume;
    if (!chart || !volume) return;
    const colors = readChartColors(this.host);

    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.labelBackground },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.labelBackground },
      },
    });

    if (this.mainType !== type || !this.main) {
      if (this.main) {
        this.main.detachPrimitive(this.markers);
        chart.removeSeries(this.main);
      }
      this.main =
        type === 'candles'
          ? chart.addSeries(CandlestickSeries, { borderVisible: false, priceLineVisible: false })
          : chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 4 });
      this.main.attachPrimitive(this.markers);
      this.mainType = type;
    }

    if (type === 'candles') {
      (this.main as ISeriesApi<'Candlestick'>).applyOptions({
        upColor: colors.gain,
        downColor: colors.loss,
        wickUpColor: colors.gain,
        wickDownColor: colors.loss,
      });
    } else {
      (this.main as ISeriesApi<'Line'>).applyOptions({ color: colors.line });
    }

    const bars = data?.bars ?? [];
    const markers = data?.earningsMarkers ?? [];
    const future = futureSessions(bars, markers);
    const blanks = future.map((time) => ({ time }));
    if (type === 'candles') {
      (this.main as ISeriesApi<'Candlestick'>).setData([
        ...bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close })),
        ...blanks,
      ]);
    } else {
      (this.main as ISeriesApi<'Line'>).setData([...bars.map((b) => ({ time: b.date, value: b.close })), ...blanks]);
    }
    volume.setData(
      bars.map((b, i) => ({
        time: b.date,
        value: b.volume,
        color: withAlpha(b.close >= (i > 0 ? bars[i - 1].close : b.open) ? colors.gain : colors.loss, 0.35),
      })),
    );
    this.markers.setMarkers(placeMarkers(bars, markers, type, colors, future), colors.surface);
    chart.timeScale().fitContent();
  }
}
