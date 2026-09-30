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

/** A point picked on the chart: a bar's date and its close. */
export interface MeasurePoint {
  date: string;
  price: number;
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
}

const DAY_MS = 86_400_000;

/** Change between two picked points, in date order whichever was tapped first. */
export function measure(a: MeasurePoint, b: MeasurePoint): Measurement {
  const [from, to] = a.date <= b.date ? [a, b] : [b, a];
  return {
    from,
    to,
    percent: ((to.price - from.price) / from.price) * 100,
    amount: to.price - from.price,
    days: Math.round((Date.parse(to.date) - Date.parse(from.date)) / DAY_MS),
  };
}

/** Change over a whole range: the first bar's close to the last one's; null with fewer than two bars. */
export function rangeChange(bars: readonly PriceBar[]): Measurement | null {
  if (bars.length < 2) return null;
  const first = bars[0];
  const last = bars[bars.length - 1];
  return measure({ date: first.date, price: first.close }, { date: last.date, price: last.close });
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
      const x = chart.timeScale().timeToCoordinate(point.date);
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
