import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { PriceBar } from '../../../../core/models/contract';
import { withAlpha } from './chart-colors';

/** A point picked on the chart: a bar's date (and start time for intraday bars) and its close. */
export interface MeasurePoint {
  date: string;
  price: number;
  /** Start of an intraday bar (ISO); absent for daily and weekly bars. */
  time?: string | null;
  /** Where the point sits on the chart's time axis, when it is not the date (intraday bars). */
  at?: Time;
}

export interface Measurement {
  from: MeasurePoint;
  to: MeasurePoint;
  /** Percent change from `from` to `to`. */
  percent: number;
  /** Price change in the stock's currency. */
  amount: number;
  /** Calendar days between the two dates. */
  days: number;
  /** Minutes between two intraday points; null when either point is a whole day. */
  minutes: number | null;
}

const DAY_MS = 86_400_000;

/** Change between two picked points, in date order whichever was tapped first. */
export function measure(a: MeasurePoint, b: MeasurePoint): Measurement {
  const intraday = !!a.time && !!b.time;
  const [from, to] = (intraday ? Date.parse(a.time!) <= Date.parse(b.time!) : a.date <= b.date)
    ? [a, b]
    : [b, a];
  return {
    from,
    to,
    percent: ((to.price - from.price) / from.price) * 100,
    amount: to.price - from.price,
    days: Math.round((Date.parse(to.date) - Date.parse(from.date)) / DAY_MS),
    minutes: intraday ? Math.round((Date.parse(to.time!) - Date.parse(from.time!)) / 60_000) : null,
  };
}

/**
 * Change over a whole range, to the last bar's close: from `baseClose` (the last close before the range, the same
 * base as the performance chips) when there is one, else from the first bar's close; null without enough data.
 */
export function rangeChange(
  bars: readonly PriceBar[],
  baseClose: number | null = null,
): Measurement | null {
  if (!bars.length) return null;
  const first = bars[0];
  const last = bars[bars.length - 1];
  if (baseClose == null && bars.length < 2) return null;
  const from = baseClose ?? first.close;
  return measure({ date: first.date, price: from }, { date: last.date, price: last.close });
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

const DOT_RADIUS = 5;

/**
 * The A→B measurement overlay: the span between the two points shaded in the gain / loss colour, a dashed
 * vertical line at each point, and a line joining the two dots. With only A picked, just its line and dot.
 */
export class MeasurePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private points: MeasurePoint[] = [];
  private colors = { gain: '#1b873f', loss: '#c62828', line: '#666666', surface: '#ffffff' };
  private placed: { x: number; y: number }[] = [];

  private readonly renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
  private readonly view: IPrimitivePaneView = {
    zOrder: () => 'top',
    renderer: () => this.renderer,
  };

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>): void {
    this.chart = chart;
    this.series = series;
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  setPoints(points: MeasurePoint[], colors: MeasurePrimitive['colors']): void {
    this.points = points;
    this.colors = colors;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    const chart = this.chart;
    const series = this.series;
    this.placed = [];
    if (!chart || !series) return;
    for (const point of this.points) {
      const x = chart.timeScale().timeToCoordinate(point.at ?? point.date);
      const y = series.priceToCoordinate(point.price);
      if (x === null || y === null) continue;
      this.placed.push({ x, y });
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  private draw(target: DrawTarget): void {
    if (!this.placed.length) return;
    const complete = this.placed.length === 2 && this.points.length === 2;
    const up = complete && measure(this.points[0], this.points[1]).percent >= 0;
    const tone = complete ? (up ? this.colors.gain : this.colors.loss) : this.colors.line;
    target.useBitmapCoordinateSpace(
      ({ context, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
        context.save();
        const xs = this.placed.map((p) => Math.round(p.x * hr));
        if (complete) {
          context.fillStyle = withAlpha(tone, 0.12);
          const left = Math.min(xs[0], xs[1]);
          context.fillRect(left, 0, Math.abs(xs[1] - xs[0]), bitmapSize.height);
        }
        context.strokeStyle = tone;
        context.lineWidth = Math.max(1, Math.round(hr));
        context.setLineDash([4 * hr, 4 * hr]);
        for (const x of xs) {
          context.beginPath();
          context.moveTo(x + 0.5, 0);
          context.lineTo(x + 0.5, bitmapSize.height);
          context.stroke();
        }
        context.setLineDash([]);
        if (complete) {
          context.lineWidth = 2 * hr;
          context.beginPath();
          context.moveTo(xs[0], this.placed[0].y * vr);
          context.lineTo(xs[1], this.placed[1].y * vr);
          context.stroke();
        }
        for (const [i, point] of this.placed.entries()) {
          context.beginPath();
          context.arc(xs[i], point.y * vr, DOT_RADIUS * hr, 0, Math.PI * 2);
          context.fillStyle = this.colors.surface;
          context.fill();
          context.lineWidth = 2 * hr;
          context.stroke();
        }
        context.restore();
      },
    );
  }
}
