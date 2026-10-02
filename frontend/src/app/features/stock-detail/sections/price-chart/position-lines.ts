import {
  AutoscaleInfo,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { PriceBar } from '../../../../core/models/contract';
import { ChartColors } from './chart-colors';

/**
 * Chart time of a bar: the date for daily bars; for 5-minute bars (1D) the start time, shifted so the axis shows
 * the device's local time (Lightweight Charts shows timestamps as UTC).
 */
export function barTime(bar: PriceBar): Time {
  if (!bar.time) return bar.date;
  const ms = Date.parse(bar.time);
  return (ms / 1000 - new Date(ms).getTimezoneOffset() * 60) as UTCTimestamp;
}

/** Pence quotes are shown in pounds, as Trading 212's prices and the price endpoint's are. */
export function majorCurrency(currency: string | null | undefined): string | null {
  if (currency === 'GBX' || currency === 'GBp') return 'GBP';
  return currency ?? null;
}

/** Average cost and current price of a held position, in the chart's currency. */
export interface PositionPrices {
  average: number | null;
  current: number | null;
}

/** Keeps both lines inside the price scale even when the price is far from them. */
export function withPositionPrices(
  base: AutoscaleInfo | null,
  prices: PositionPrices | null,
): AutoscaleInfo | null {
  const extra = [prices?.average, prices?.current].filter((v): v is number => v != null);
  if (!base?.priceRange || !extra.length) return base;
  return {
    ...base,
    priceRange: {
      minValue: Math.min(base.priceRange.minValue, ...extra),
      maxValue: Math.max(base.priceRange.maxValue, ...extra),
    },
  };
}

/**
 * Replaces `previous` on `series` with a dashed line at the average cost and a solid one at the current price
 * (green above the average, red below). Returns the new lines.
 */
export function drawPositionLines(
  series: ISeriesApi<SeriesType>,
  previous: IPriceLine[],
  prices: PositionPrices | null,
  colors: ChartColors,
): IPriceLine[] {
  previous.forEach((line) => series.removePriceLine(line));
  const lines: IPriceLine[] = [];
  if (prices?.average != null) {
    lines.push(
      series.createPriceLine({
        price: prices.average,
        color: colors.neutral,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: $localize`:Chart line at the average price paid:Average`,
      }),
    );
  }
  if (prices?.current != null) {
    const up = prices.average == null || prices.current >= prices.average;
    lines.push(
      series.createPriceLine({
        price: prices.current,
        color: up ? colors.gain : colors.loss,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: $localize`:Chart line at the current price:Now`,
      }),
    );
  }
  return lines;
}
