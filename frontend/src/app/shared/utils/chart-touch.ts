import {
  HandleScrollOptions,
  IChartApi,
  ISeriesApi,
  MismatchDirection,
  SeriesType,
  Time,
} from 'lightweight-charts';

/**
 * Touch scrolling for every chart: vertical drags scroll the page, a one-finger horizontal drag moves the crosshair
 * (see {@link enableTouchCrosshair}) instead of panning, and two fingers still zoom.
 */
export const TOUCH_HANDLE_SCROLL: Partial<HandleScrollOptions> = {
  vertTouchDrag: false,
  horzTouchDrag: false,
};

/**
 * Touch: a tap or a one-finger drag shows the crosshair at once (the library's default needs a long press and drops it
 * on the next tap). It stays on the touched point until the next touch. `onTouch` gets the touched bar's time so the
 * caller can update its legend.
 */
export function enableTouchCrosshair(
  chart: IChartApi,
  el: HTMLElement,
  series: () => ISeriesApi<SeriesType> | undefined,
  onTouch: (time: Time) => void,
): void {
  const track = (e: TouchEvent) => {
    const target = series();
    if (e.touches.length !== 1 || !target) return;
    const x = e.touches[0].clientX - el.getBoundingClientRect().left;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return;
    const bar = target.dataByIndex(Math.round(logical), MismatchDirection.NearestLeft);
    if (!bar) return;
    const price = 'value' in bar ? bar.value : 'close' in bar ? bar.close : undefined;
    if (price === undefined) return;
    chart.setCrosshairPosition(price, bar.time, target);
    onTouch(bar.time);
  };
  el.addEventListener('touchstart', track, { passive: true });
  el.addEventListener('touchmove', track, { passive: true });
}
