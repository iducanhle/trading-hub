import { EarningsMarker, PriceBar } from '../../../../core/models/contract';
import { addDays, isWeekend } from '../../../../shared/utils/dates';
import { ChartColors } from './chart-colors';
import { ChartMarker } from './earnings-markers';

export type ChartType = 'line' | 'candles';

/** Weekdays after `from`, up to and including `to`. */
export function weekdaysAfter(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isWeekend(d)) days.push(d);
  return days;
}

/**
 * Blank future sessions to extend the time axis to the upcoming report's reaction day. The upcoming marker counts as
 * "within the range" only if that gap takes at most a quarter of the loaded bars (so 1Y shows a report up to about
 * three months out, 1W only one within the next week); otherwise the axis is not stretched and the marker is left out.
 */
export function futureSessions(bars: PriceBar[], markers: EarningsMarker[]): string[] {
  const last = bars.at(-1);
  const upcoming = markers.find((m) => m.result === 'UPCOMING');
  if (!last || !upcoming || upcoming.date <= last.date) return [];
  const days = weekdaysAfter(last.date, upcoming.date);
  return days.length <= Math.max(5, Math.round(bars.length / 4)) ? days : [];
}

/** Where each earnings marker hangs, and in which colour. */
export function placeMarkers(
  bars: PriceBar[],
  markers: EarningsMarker[],
  type: ChartType,
  colors: ChartColors,
  future: string[],
): ChartMarker[] {
  const byDate = new Map(bars.map((b) => [b.date, b]));
  const lastClose = bars.at(-1)?.close;
  const placed: ChartMarker[] = [];
  for (const marker of markers) {
    const bar = byDate.get(marker.date);
    if (marker.result === 'UPCOMING') {
      const price = bar ? (type === 'candles' ? bar.low : bar.close) : lastClose;
      if (price == null || (!bar && !future.includes(marker.date))) continue;
      placed.push({ time: marker.date, price, color: colors.line, hollow: true, data: marker });
      continue;
    }
    if (!bar) continue;
    const color = marker.result === 'BEAT' ? colors.gain : marker.result === 'MISS' ? colors.loss : colors.neutral;
    placed.push({ time: marker.date, price: type === 'candles' ? bar.low : bar.close, color, hollow: false, data: marker });
  }
  return placed;
}
