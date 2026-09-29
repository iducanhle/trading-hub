import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/** Horizontal swipe gestures on touch screens (passive listeners, so scrolling is never delayed). */
@Directive({ selector: '[appSwipe]' })
export class Swipe {
  readonly swipeLeft = output<void>();
  readonly swipeRight = output<void>();

  constructor() {
    const element: HTMLElement = inject(ElementRef).nativeElement;
    let origin: { x: number; y: number; time: number } | null = null;

    const onStart = (event: TouchEvent) => {
      origin =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() }
          : null;
    };
    const onEnd = (event: TouchEvent) => {
      if (!origin) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      const quick = Date.now() - origin.time < 700;
      origin = null;
      if (quick && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) this.swipeLeft.emit();
        else this.swipeRight.emit();
      }
    };

    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchend', onEnd, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchend', onEnd);
    });
  }
}
