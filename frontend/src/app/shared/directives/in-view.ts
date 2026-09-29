import { DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/** Emits whenever the element comes within 200 px of the viewport (infinite scroll triggers). */
@Directive({ selector: '[appInView]' })
export class InView {
  readonly inView = output<void>();

  constructor() {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) this.inView.emit();
      },
      { rootMargin: '200px' },
    );
    observer.observe(inject(ElementRef).nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
