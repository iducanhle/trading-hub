import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  ColorType,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineSeries,
  createChart,
} from 'lightweight-charts';
import { PriceBar } from '../../core/models/contract';
import { ThemeService } from '../../core/services/theme.service';
import { NUMBER_LOCALE } from '../../shared/utils/format';
import { readChartColors } from '../stock-detail/sections/price-chart/chart-colors';
import {
  PositionPrices,
  barTime,
  drawPositionLines,
  withPositionPrices,
} from '../stock-detail/sections/price-chart/position-lines';

const priceFormat = new Intl.NumberFormat(NUMBER_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A compact closing-price line with two horizontal lines: the average price paid (dashed) and the current price.
 * Prices are in the chart's currency; a line is left out when its price is null. 1D bars carry a time.
 */
@Component({
  selector: 'app-position-chart',
  template: `<div #container class="h-56 w-full" role="img" [attr.aria-label]="label()"></div>`,
  host: { class: 'block' },
})
export class PositionChart {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly theme = inject(ThemeService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('container');

  readonly bars = input.required<PriceBar[]>();
  readonly averagePrice = input<number | null>(null);
  readonly currentPrice = input<number | null>(null);
  /** Accessible description of the chart. */
  readonly label = input('');

  private chart?: IChartApi;
  private series?: ISeriesApi<'Line'>;
  private lines: IPriceLine[] = [];
  private readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      this.create();
      this.ready.set(true);
    });
    effect(() => {
      const bars = this.bars();
      const prices = { average: this.averagePrice(), current: this.currentPrice() };
      this.theme.dark(); // re-read the colours when the theme changes
      if (this.ready()) untracked(() => this.render(bars, prices));
    });
    inject(DestroyRef).onDestroy(() => this.chart?.remove());
  }

  private create(): void {
    this.chart = createChart(this.container().nativeElement, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        // Required by the Lightweight Charts licence: keep the TradingView attribution.
        attributionLogo: true,
      },
      localization: { locale: NUMBER_LOCALE, priceFormatter: (p: number) => priceFormat.format(p) },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      handleScroll: { vertTouchDrag: false },
    });
    this.series = this.chart.addSeries(LineSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 4,
      autoscaleInfoProvider: (original: () => ReturnType<typeof withPositionPrices>) =>
        withPositionPrices(original(), {
          average: this.averagePrice(),
          current: this.currentPrice(),
        }),
    });
  }

  private render(bars: PriceBar[], prices: PositionPrices): void {
    const { chart, series } = this;
    if (!chart || !series) return;
    const colors = readChartColors(this.host);
    const intraday = bars.some((b) => b.time);
    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
      timeScale: { timeVisible: intraday, secondsVisible: false },
    });
    series.applyOptions({ color: colors.line });
    series.setData(bars.map((b) => ({ time: barTime(b), value: b.close })));
    this.lines = drawPositionLines(series, this.lines, prices, colors);
    chart.timeScale().fitContent();
  }
}
