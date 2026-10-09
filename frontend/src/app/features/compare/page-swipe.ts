import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';

/** A swipe must cover this share of the screen width (and at least MIN_PX) to count, so a stray touch never does. */
const SHARE = 0.3;
const MIN_PX = 96;
/** Movement before the gesture decides whether it is horizontal (a swipe) or vertical (scrolling). */
const LOCK_PX = 12;
/** The page follows the finger at this fraction of its travel, a hint of how far is still to go. */
const FOLLOW = 0.4;

/**
 * Whole-page horizontal swipes on touch screens (the compare page's switch to the previous or next stock). Stricter
 * than `appSwipe`: the finger must travel a third of the screen, mostly sideways, and the gesture is ignored where
 * the page already has its own horizontal gestures (the chart, `appSwipe` areas such as the history calendar,
 * sideways-scrolling rows). While dragging, the shown child follows the finger and springs back when let go short.
 * Listeners are passive, so vertical scrolling is never delayed.
 */
@Directive({ selector: '[appPageSwipe]' })
export class PageSwipe {
  readonly swipeEnabled = input(true);
  readonly swipeLeft = output<void>();
  readonly swipeRight = output<void>();

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    let origin: { x: number; y: number } | null = null;
    /** null until the gesture is locked; then true for a swipe, false for scrolling. */
    let horizontal: boolean | null = null;
    let target: HTMLElement | null = null;

    const reset = (animate: boolean) => {
      if (target) {
        const el = target;
        if (animate) {
          el.style.transition = 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)';
          el.addEventListener('transitionend', () => (el.style.transition = ''), { once: true });
        }
        el.style.transform = '';
      }
      origin = null;
      horizontal = null;
      target = null;
    };

    const onStart = (event: TouchEvent) => {
      reset(false);
      if (!this.swipeEnabled() || event.touches.length !== 1) return;
      if (ownsHorizontalGesture(event.target as Element | null, host)) return;
      origin = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!origin) return;
      if (event.touches.length !== 1) return reset(true);
      const dx = event.touches[0].clientX - origin.x;
      const dy = event.touches[0].clientY - origin.y;
      if (horizontal === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return;
        horizontal = Math.abs(dx) > Math.abs(dy) * 2;
        if (!horizontal) return;
        target = host.querySelector<HTMLElement>(':scope > :not(.hidden)');
      }
      if (horizontal && target) target.style.transform = `translateX(${dx * FOLLOW}px)`;
    };
    const onEnd = (event: TouchEvent) => {
      if (!origin || !horizontal) return reset(true);
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      const needed = Math.max(MIN_PX, window.innerWidth * SHARE);
      const swiped = Math.abs(dx) >= needed && Math.abs(dx) > Math.abs(dy) * 2;
      reset(!swiped);
      if (!swiped) return;
      if (dx < 0) this.swipeLeft.emit();
      else this.swipeRight.emit();
    };
    const onCancel = () => reset(true);

    const passive = { passive: true };
    host.addEventListener('touchstart', onStart, passive);
    host.addEventListener('touchmove', onMove, passive);
    host.addEventListener('touchend', onEnd, passive);
    host.addEventListener('touchcancel', onCancel, passive);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
      host.removeEventListener('touchcancel', onCancel);
    });
  }
}

/** True when the touch starts on something with its own sideways gesture or scrolling. */
function ownsHorizontalGesture(start: Element | null, host: HTMLElement): boolean {
  if (start?.closest('app-price-chart, [appSwipe], input, textarea, .cdk-overlay-container'))
    return true;
  for (let el = start; el && el !== host; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}
