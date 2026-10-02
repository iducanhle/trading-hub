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
  IPriceLine,
  ISeriesApi,
  LineSeries,
  MouseEventParams,
  Time,
  createChart,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  createSeriesMarkers,
} from 'lightweight-charts';
import { of } from 'rxjs';
import { ApiService } from '../../../../core/api/api.service';
import {
  EarningsMarker,
  PriceBar,
  PriceRange,
  PricesResponse,
} from '../../../../core/models/contract';
import { T212Service } from '../../../../core/services/t212.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TermInfo } from '../../../../shared/components/term-info/term-info';
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
  SignedNumberPipe,
} from '../../../../shared/pipes/format.pipes';
import { NUMBER_LOCALE, PERIOD_LABELS } from '../../../../shared/utils/format';
import { APP_LOCALE } from '../../../../shared/utils/locale';
import { persistedSignal } from '../../../../shared/utils/persisted-signal';
import { StockContext } from '../../stock-context';
import { readChartColors, withAlpha } from './chart-colors';
import { ChartType, futureSessions, placeMarkers } from './chart-data';
import { EarningsMarkersPrimitive } from './earnings-markers';
import { MeasurePoint, MeasurePrimitive, measure, rangeChange } from './measure';
import { DEVICE_TZ } from '../../../portfolio/portfolio-model';
import { tradeMarks } from './trade-markers';
import {
  PositionPrices,
  barTime,
  drawPositionLines,
  majorCurrency,
  withPositionPrices,
} from './position-lines';

const RANGES: PriceRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y'];

interface LegendBar extends PriceBar {
  /** Percent change from the previous close. */
  change: number | null;
}

/** Legend key of a chart time: the date for daily bars, the shifted timestamp for 1D. */
function timeKey(time: Time): string {
  if (typeof time === 'string') return time;
  if (typeof time === 'number') return String(time);
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

const priceFormat = new Intl.NumberFormat(NUMBER_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Section 4: line or candlestick chart of daily bars with volume, earnings markers on the reaction days, a touch
 * crosshair legend (date, OHLC or close, volume), pinch/drag zoom within the loaded range, and theme-aware colours.
 */
@Component({
  selector: 'app-price-chart',
  imports: [
    TermInfo,
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
    SignedNumberPipe,
  ],
  template: `
    <section class="border-t border-outline-variant pt-3 pb-2" aria-labelledby="price-chart-title">
      <h2 id="price-chart-title" class="sr-only" i18n>Price chart</h2>
      <div class="flex flex-wrap items-center justify-between gap-2 px-4">
        <div
          class="flex max-w-full overflow-x-auto rounded-full bg-surface-container-high p-1"
          role="group"
          aria-label="Chart range"
          i18n-aria-label
        >
          @for (r of ranges; track r) {
            <button
              type="button"
              class="h-9 min-w-9 shrink-0 rounded-full px-1.5 text-sm font-medium transition-colors"
              [class.bg-surface]="range() === r"
              [class.text-on-surface]="range() === r"
              [class.shadow-sm]="range() === r"
              [class.text-on-surface-variant]="range() !== r"
              [attr.aria-pressed]="range() === r"
              (click)="setRange(r)"
            >
              {{ rangeLabels[r] }}
            </button>
          }
        </div>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          aria-label="Chart type"
          i18n-aria-label
          [value]="type()"
          (change)="setType($event.value)"
        >
          <mat-button-toggle
            value="line"
            aria-label="Line"
            i18n-aria-label="Line chart"
            title="Line"
            i18n-title="Line chart"
          >
            <app-icon name="show_chart" [size]="20" class="align-middle" />
          </mat-button-toggle>
          <mat-button-toggle
            value="candles"
            aria-label="Candles"
            i18n-aria-label="Candlestick chart"
            title="Candles"
            i18n-title="Candlestick chart"
          >
            <app-icon name="candlestick_chart" [size]="20" class="align-middle" />
          </mat-button-toggle>
        </mat-button-toggle-group>
        @if (type() === 'candles') {
          <app-term-info term="candles" class="-ml-1" />
        }
      </div>

      <!-- The range's change, or in measure mode the change from A to B. -->
      <div class="flex min-h-14 items-center gap-2 px-4 pt-2 text-sm tabular-nums">
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2" aria-live="polite">
          @if (measuring()) {
            @if (measurement(); as m) {
              <span class="text-on-surface-variant"
                >{{ m.from.date | appDate: 'dayMonth' }} →
                {{ m.to.date | appDate: 'dayMonth' }}</span
              >
              <app-change pill [value]="m.percent" />
              <span [class]="m.amount >= 0 ? 'text-gain' : 'text-loss'">{{
                m.amount | signed
              }}</span>
              <span class="text-on-surface-variant" i18n>{m.days, plural,
                =1 {1 day}
                other {{{ m.days }} days}
              }</span>
            } @else if (points().length) {
              <span class="text-on-surface-variant" i18n>Now tap the end point</span>
            } @else {
              <span class="text-on-surface-variant" i18n>Tap the start point</span>
            }
          } @else if (rangeGain(); as g) {
            <span class="font-medium text-on-surface-variant">{{ rangeLabels[range()] }}</span>
            <app-change pill [value]="g.percent" />
            <span [class]="g.amount >= 0 ? 'text-gain' : 'text-loss'">{{ g.amount | signed }}</span>
          }
        </div>
        <button
          type="button"
          class="flex h-9 shrink-0 items-center gap-1 rounded-full border border-outline-variant px-3 text-sm font-medium"
          [class.invisible]="intraday()"
          [attr.aria-hidden]="intraday() || null"
          [disabled]="intraday()"
          [class.bg-secondary-container]="measuring()"
          [class.text-on-secondary-container]="measuring()"
          [class.border-transparent]="measuring()"
          [attr.aria-pressed]="measuring()"
          title="Tap two points on the chart to see the change between them"
          i18n-title
          (click)="toggleMeasuring()"
        >
          <app-icon [name]="measuring() ? 'close' : 'straighten'" [size]="18" />
          @if (measuring()) {
            <ng-container i18n>Done</ng-container>
          } @else {
            <ng-container i18n="Measure the change between two points">Measure</ng-container>
          }
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 px-4 pt-1 text-xs text-on-surface-variant">
        @if (positionPrices()) {
          <button
            type="button"
            class="flex h-8 items-center gap-1 rounded-full border border-outline-variant px-3 text-sm font-medium text-on-surface"
            [class.bg-secondary-container]="showLines()"
            [class.border-transparent]="showLines()"
            [attr.aria-pressed]="showLines()"
            (click)="showLines.set(!showLines())"
          >
            <app-icon name="straighten" [size]="16" />
            <ng-container i18n="Chart toggle: average cost and current price lines"
              >Average and current price</ng-container
            >
          </button>
        }
        <button
          type="button"
          class="flex h-8 items-center gap-1 rounded-full border border-outline-variant px-3 text-sm font-medium text-on-surface"
          [class.bg-secondary-container]="showEarnings()"
          [class.border-transparent]="showEarnings()"
          [attr.aria-pressed]="showEarnings()"
          (click)="showEarnings.set(!showEarnings())"
        >
          <app-icon name="event" [size]="16" />
          <ng-container i18n="Chart toggle: earnings markers">Earnings</ng-container>
        </button>
        @if (hasTrades()) {
          <button
            type="button"
            class="flex h-8 items-center gap-1 rounded-full border border-outline-variant px-3 text-sm font-medium text-on-surface"
            [class.bg-secondary-container]="showTrades()"
            [class.border-transparent]="showTrades()"
            [attr.aria-pressed]="showTrades()"
            (click)="showTrades.set(!showTrades())"
          >
            <app-icon name="account_balance_wallet" [size]="16" />
            <ng-container i18n>My trades</ng-container>
          </button>
          @if (showTrades()) {
            <span class="inline-flex items-center gap-1" aria-hidden="true"
              ><span class="text-primary">▲</span>
              <ng-container i18n="Trade direction|Kind of trade">Buy</ng-container></span
            >
            <span class="inline-flex items-center gap-1" aria-hidden="true"
              ><span class="text-on-surface">▼</span>
              <ng-container i18n="Trade direction|Kind of trade">Sell</ng-container></span
            >
          }
        }
      </div>

      <div
        class="flex min-h-7 flex-wrap items-center gap-x-3 px-4 pt-1 text-xs tabular-nums text-on-surface-variant"
      >
        @if (legend(); as bar) {
          <span class="font-medium text-on-surface">{{
            bar.time ? clock(bar.time) : (bar.date | appDate: 'medium')
          }}</span>
          @if (type() === 'candles') {
            <span>O {{ bar.open | num }}</span>
            <span>H {{ bar.high | num }}</span>
            <span>L {{ bar.low | num }}</span>
            <span class="text-on-surface">C {{ bar.close | num }}</span>
          } @else {
            <span class="text-sm font-medium text-on-surface">{{
              bar.close | price: currency()
            }}</span>
          }
          <app-change [value]="bar.change" />
          <span i18n="Trading volume">Vol {{ bar.volume | compact }}</span>
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
          <p
            class="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant"
            i18n
          >
            No prices for this period.
          </p>
        }
        @if (prices.isLoading() && data()) {
          <div
            class="absolute top-2 right-4 size-2 animate-ping rounded-full bg-primary"
            aria-hidden="true"
          ></div>
        }

        @if (selected(); as marker) {
          <div
            class="absolute top-2 right-2 left-2 z-10 rounded-2xl bg-surface-container-highest p-3 text-sm shadow-lg sm:left-auto sm:w-72"
            role="dialog"
            aria-label="Earnings details"
            i18n-aria-label
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="font-semibold">
                  @if (marker.result === 'UPCOMING') {
                    <ng-container i18n>Upcoming earnings</ng-container>
                  } @else {
                    <ng-container i18n>Earnings</ng-container>
                  }
                  · {{ marker.reportDate | appDate: 'medium' }}
                </p>
                <p class="text-xs text-on-surface-variant">
                  {{ marker.time | reportTime }}
                  @if (selectedQuarter()?.timeAssumed) {
                    <span i18n="The report time is a guess">(assumed)</span>
                  }
                  @if (marker.result === 'UPCOMING') {
                    · {{ marker.reportDate | relativeDay }}
                  }
                </p>
              </div>
              <app-result-badge [result]="marker.result" />
              <button
                matIconButton
                type="button"
                class="-mt-2 -mr-2"
                aria-label="Close"
                i18n-aria-label
                (click)="selected.set(null)"
              >
                <app-icon name="close" [size]="20" />
              </button>
            </div>
            <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
              @if (marker.result === 'UPCOMING') {
                <dt class="text-on-surface-variant" i18n>EPS estimate</dt>
                <dd>{{ upcomingEstimate() | price: currency() }}</dd>
              } @else {
                <dt class="text-on-surface-variant" i18n>EPS est. → actual</dt>
                <dd>
                  {{ selectedQuarter()?.eps?.estimate | price: currency() }} →
                  {{ selectedQuarter()?.eps?.actual | price: currency() }}
                </dd>
                <dt class="text-on-surface-variant" i18n>Surprise</dt>
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
  private readonly t212 = inject(T212Service);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  protected readonly ranges = RANGES;
  protected readonly rangeLabels = PERIOD_LABELS;
  protected readonly range = signal<PriceRange>('6M');
  protected readonly type = persistedSignal<ChartType>('et.chartType', 'line');

  protected readonly prices = rxResource({
    params: () =>
      this.ctx.symbol()
        ? { symbol: this.ctx.symbol(), range: this.range(), version: this.ctx.version() }
        : undefined,
    stream: ({ params }) =>
      this.api.prices(params.symbol, params.range, { force: params.version > 0 }),
  });
  /** For the marker card; the same cached request the earnings sections use. */
  private readonly earnings = this.ctx.resource((symbol, options) =>
    this.api.earnings(symbol, options),
  );

  /** The user's Trading 212 trades in this stock, for the buy/sell markers (nothing when not connected). */
  private readonly holdings = rxResource({
    params: () => ({ connected: this.t212.connected(), version: this.t212.dataVersion() }),
    stream: ({ params }) =>
      params.connected ? this.api.t212Instruments({ tz: DEVICE_TZ, status: 'ALL' }) : of(null),
  });
  private readonly t212Ticker = computed(() => {
    const list = this.holdings.hasValue() ? this.holdings.value() : null;
    return list?.items.find((i) => i.symbol === this.ctx.symbol())?.t212Ticker ?? null;
  });
  private readonly myTrades = rxResource({
    params: () => {
      const ticker = this.t212Ticker();
      return ticker ? { ticker, version: this.t212.dataVersion() } : undefined;
    },
    stream: ({ params }) => this.api.t212Instrument(params.ticker),
  });
  private readonly trades = computed(() =>
    this.myTrades.hasValue() ? this.myTrades.value().trades : [],
  );
  protected readonly hasTrades = computed(() => this.trades().some((t) => t.kind === 'TRADE'));
  protected readonly showTrades = persistedSignal('et.chartTrades', true);
  protected readonly showEarnings = persistedSignal('et.chartEarnings', true);
  protected readonly showLines = persistedSignal('et.chartPositionLines', true);
  protected readonly intraday = computed(() => this.range() === '1D');

  /** Average cost and current price of an open Trading 212 position, when in the chart's currency. */
  protected readonly positionPrices = computed<PositionPrices | null>(() => {
    const detail = this.myTrades.hasValue() ? this.myTrades.value() : null;
    const i = detail?.instrument;
    const chartCurrency = majorCurrency(this.data()?.currency);
    if (!i || i.status !== 'OPEN' || !chartCurrency) return null;
    if (majorCurrency(i.instrumentCurrency) !== chartCurrency) return null;
    if (i.averageCost == null && i.currentPrice == null) return null;
    return { average: i.averageCost, current: i.currentPrice };
  });
  private readonly shownPositionPrices = computed(() =>
    this.showLines() ? this.positionPrices() : null,
  );

  protected readonly data = computed<PricesResponse | undefined>(() =>
    this.prices.hasValue() ? this.prices.value() : undefined,
  );
  protected readonly currency = computed(() => this.data()?.currency ?? null);
  protected readonly hovered = signal<LegendBar | null>(null);
  protected readonly selected = signal<EarningsMarker | null>(null);
  /** Measure mode: taps pick point A, then B; another tap starts over from a new A. */
  protected readonly measuring = signal(false);
  protected readonly points = signal<MeasurePoint[]>([]);
  protected readonly measurement = computed(() => {
    const [a, b] = this.points();
    return a && b ? measure(a, b) : null;
  });
  protected readonly rangeGain = computed(() =>
    rangeChange(this.data()?.bars ?? [], this.data()?.baseClose ?? null),
  );

  private readonly legendBars = computed(() => {
    const bars = this.data()?.bars ?? [];
    return new Map(
      bars.map((bar, i): [string, LegendBar] => [
        timeKey(barTime(bar)),
        {
          ...bar,
          change: i > 0 ? ((bar.close - bars[i - 1].close) / bars[i - 1].close) * 100 : null,
        },
      ]),
    );
  });
  protected readonly legend = computed(() => {
    const bars = this.data()?.bars;
    return (
      this.hovered() ??
      (bars?.length
        ? (this.legendBars().get(timeKey(barTime(bars[bars.length - 1]))) ?? null)
        : null)
    );
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
  private readonly measureOverlay = new MeasurePrimitive();
  private tradeMarkers?: ISeriesMarkersPluginApi<Time>;
  private positionLines: IPriceLine[] = [];
  private readonly clockFormat = new Intl.DateTimeFormat(APP_LOCALE, {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  private readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      this.createChart();
      this.ready.set(true);
    });
    effect(() => {
      const data = this.data();
      const type = this.type();
      this.showEarnings();
      this.theme.dark(); // re-read the colours when the theme changes
      if (this.ready()) untracked(() => this.render(data, type));
    });
    effect(() => {
      this.data();
      this.type();
      const prices = this.shownPositionPrices();
      this.theme.dark();
      if (this.ready()) untracked(() => this.drawLines(prices));
    });
    effect(() => {
      this.data();
      this.type();
      this.trades();
      this.showTrades();
      this.theme.dark();
      if (this.ready()) untracked(() => this.drawTrades());
    });
    effect(() => {
      const points = this.points();
      this.type(); // the overlay moves to the new series
      this.theme.dark();
      if (this.ready()) untracked(() => this.drawMeasure(points));
    });
    inject(DestroyRef).onDestroy(() => this.chart?.remove());
  }

  protected setRange(range: PriceRange): void {
    this.range.set(range);
    this.selected.set(null);
    this.points.set([]);
    if (range === '1D') this.measuring.set(false);
  }

  protected clock(time: string): string {
    return this.clockFormat.format(new Date(time));
  }

  protected toggleMeasuring(): void {
    this.measuring.update((on) => !on);
    this.points.set([]);
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
      localization: {
        locale: NUMBER_LOCALE,
        priceFormatter: (price: number) => priceFormat.format(price),
      },
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
      this.hovered.set(
        param.time && param.point ? (this.legendBars().get(timeKey(param.time)) ?? null) : null,
      );
    });
    chart.subscribeClick((param: MouseEventParams<Time>) => {
      if (this.measuring()) {
        this.pick(param);
        return;
      }
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
        this.tradeMarkers?.detach();
        this.tradeMarkers = undefined;
        this.main.detachPrimitive(this.markers);
        this.main.detachPrimitive(this.measureOverlay);
        chart.removeSeries(this.main);
      }
      // Keep the position lines inside the price scale even when the price is far from them.
      const autoscaleInfoProvider = (original: () => ReturnType<typeof withPositionPrices>) =>
        withPositionPrices(original(), this.shownPositionPrices());
      this.positionLines = [];
      this.main =
        type === 'candles'
          ? chart.addSeries(CandlestickSeries, {
              borderVisible: false,
              priceLineVisible: false,
              autoscaleInfoProvider,
            })
          : chart.addSeries(LineSeries, {
              lineWidth: 2,
              priceLineVisible: false,
              crosshairMarkerRadius: 4,
              autoscaleInfoProvider,
            });
      this.main.attachPrimitive(this.markers);
      this.main.attachPrimitive(this.measureOverlay);
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
    const markers = this.showEarnings() ? (data?.earningsMarkers ?? []) : [];
    const future = futureSessions(bars, markers);
    chart.applyOptions({
      timeScale: { timeVisible: bars.some((b) => b.time), secondsVisible: false },
    });
    const blanks = future.map((time) => ({ time }));
    if (type === 'candles') {
      (this.main as ISeriesApi<'Candlestick'>).setData([
        ...bars.map((b) => ({
          time: barTime(b),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
        ...blanks,
      ]);
    } else {
      (this.main as ISeriesApi<'Line'>).setData([
        ...bars.map((b) => ({ time: barTime(b), value: b.close })),
        ...blanks,
      ]);
    }
    volume.setData(
      bars.map((b, i) => ({
        time: barTime(b),
        value: b.volume,
        color: withAlpha(
          b.close >= (i > 0 ? bars[i - 1].close : b.open) ? colors.gain : colors.loss,
          0.35,
        ),
      })),
    );
    this.markers.setMarkers(placeMarkers(bars, markers, type, colors, future), colors.surface);
    chart.timeScale().fitContent();
  }

  /** Buy (▲ below the bar) and sell (▼ above it) markers of the user's own trades, when switched on. */
  private drawTrades(): void {
    if (!this.main) return;
    const bars = this.data()?.bars ?? [];
    // Trade markers sit on days; 1D has no day bars to hang them on.
    const marks =
      this.showTrades() && this.hasTrades() && !bars.some((b) => b.time)
        ? tradeMarks(
            this.trades(),
            this.ctx.symbol(),
            bars.map((b) => b.date),
          )
        : [];
    if (!this.tradeMarkers) {
      if (marks.length === 0) return;
      this.tradeMarkers = createSeriesMarkers(this.main, [], { zOrder: 'aboveSeries' });
    }
    const colors = readChartColors(this.host);
    this.tradeMarkers.setMarkers(
      marks.map((m): SeriesMarker<Time> => ({
        time: m.date,
        position: m.side === 'BUY' ? 'belowBar' : 'aboveBar',
        shape: m.side === 'BUY' ? 'arrowUp' : 'arrowDown',
        color: m.side === 'BUY' ? colors.line : colors.labelBackground,
        text: m.count > 1 ? `${m.count}×` : '',
        size: 1,
      })),
    );
  }

  private drawLines(prices: PositionPrices | null): void {
    if (!this.main) return;
    this.positionLines = drawPositionLines(
      this.main,
      this.positionLines,
      prices,
      readChartColors(this.host),
    );
  }

  /** Adds the tapped bar as A or B (a tap after B starts over); taps off the bars are ignored. */
  private pick(param: MouseEventParams<Time>): void {
    const bar = param.time && param.point ? this.legendBars().get(timeKey(param.time)) : undefined;
    if (!bar) return;
    const point: MeasurePoint = { date: bar.date, price: bar.close };
    this.points.update((points) =>
      points.length === 1 && points[0].date !== point.date ? [points[0], point] : [point],
    );
  }

  private drawMeasure(points: MeasurePoint[]): void {
    const colors = readChartColors(this.host);
    this.measureOverlay.setPoints(points, {
      gain: colors.gain,
      loss: colors.loss,
      line: colors.crosshair,
      surface: colors.surface,
    });
  }
}
