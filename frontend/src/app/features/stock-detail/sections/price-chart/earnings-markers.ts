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
import { EarningsMarker } from '../../../../core/models/contract';

export interface ChartMarker {
  /** Bar (or future whitespace) date the marker belongs to. */
  time: string;
  /** Price the marker hangs below: the bar's low (candles) or close (line). */
  price: number;
  color: string;
  /** Outlined instead of filled: an upcoming report. */
  hollow: boolean;
  data: EarningsMarker;
}

interface PlacedMarker {
  x: number;
  y: number;
  marker: ChartMarker;
}

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

const RADIUS = 10;
const GAP = 10;
const HIT_SLOP = 8;

/**
 * Earnings markers drawn as a series primitive: a 20 px ring with an "E" under the reaction-day bar, on the page
 * colour, in the result's colour (green = beat, red = miss, grey = in line / unknown; the upcoming report in the
 * marker's own colour). The built-in series markers
 * cannot draw hollow shapes, and owning the layout makes taps easy to hit-test.
 */
export class EarningsMarkersPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private markers: ChartMarker[] = [];
  private placed: PlacedMarker[] = [];
  private surface = '#ffffff';

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

  setMarkers(markers: ChartMarker[], surface: string): void {
    this.markers = markers;
    this.surface = surface;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series) {
      this.placed = [];
      return;
    }
    const timeScale = chart.timeScale();
    this.placed = [];
    for (const marker of this.markers) {
      const x = timeScale.timeToCoordinate(marker.time);
      const y = series.priceToCoordinate(marker.price);
      if (x === null || y === null) continue;
      this.placed.push({ x, y: y + GAP + RADIUS, marker });
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  /** The marker at a point of the chart pane (CSS pixels), if any. */
  markerAt(x: number, y: number): ChartMarker | null {
    let best: PlacedMarker | null = null;
    let bestDistance = RADIUS + HIT_SLOP;
    for (const placed of this.placed) {
      const distance = Math.hypot(placed.x - x, placed.y - y);
      if (distance <= bestDistance) {
        best = placed;
        bestDistance = distance;
      }
    }
    return best?.marker ?? null;
  }

  private draw(target: DrawTarget): void {
    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
        context.save();
        context.font = `800 ${Math.round(10 * vr)}px 'Poppins', system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (const { x, y, marker } of this.placed) {
          const cx = Math.round(x * hr);
          const cy = Math.round(y * vr);
          context.beginPath();
          context.arc(cx, cy, RADIUS * hr, 0, Math.PI * 2);
          context.fillStyle = this.surface;
          context.fill();
          context.lineWidth = 2 * hr;
          context.strokeStyle = marker.color;
          context.stroke();
          context.fillStyle = marker.color;
          context.fillText('E', cx, cy + 0.5 * vr);
        }
        context.restore();
      },
    );
  }
}
