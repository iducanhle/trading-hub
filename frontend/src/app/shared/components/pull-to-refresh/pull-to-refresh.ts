import {
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../icon/icon';

const THRESHOLD = 72;
const MAX_PULL = 110;

/**
 * Pull-to-refresh for touch screens: pulling down from the top of the page past a threshold emits `refresh`; the
 * indicator spins while `refreshing` is true. The browser's own pull-to-refresh is off (overscroll-behavior), and
 * pages also offer a refresh button for mouse and keyboard users.
 */
@Component({
  selector: 'app-pull-to-refresh',
  imports: [Icon],
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
      aria-hidden="true"
    >
      <div
        class="mt-2 flex size-10 items-center justify-center rounded-full bg-surface-container-highest text-primary shadow-md"
        [class.transition-all]="!dragging()"
        [class.duration-200]="!dragging()"
        [style.opacity]="visible() ? 1 : 0"
        [style.transform]="'translateY(' + offset() + 'px)'"
      >
        <app-icon
          name="refresh"
          [class.animate-spin]="refreshing()"
          [style.transform]="refreshing() ? null : 'rotate(' + pull() * 3 + 'deg)'"
        />
      </div>
    </div>
    @if (refreshing()) {
      <span class="sr-only" role="status" i18n>Refreshing</span>
    }
    <ng-content />
  `,
  host: { class: 'block' },
})
export class PullToRefresh {
  readonly refreshing = input(false);
  readonly refresh = output<void>();

  protected readonly pull = signal(0);
  protected readonly dragging = signal(false);
  protected readonly visible = computed(() => this.refreshing() || this.pull() > 8);
  protected readonly offset = computed(() =>
    this.refreshing() ? 24 : Math.min(this.pull(), MAX_PULL) - 40,
  );

  private start: { x: number; y: number } | null = null;

  constructor() {
    const doc = inject(DOCUMENT);
    const view = doc.defaultView!;
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      const inOverlay = !!target?.closest?.('.cdk-overlay-container');
      if (event.touches.length !== 1 || view.scrollY > 0 || this.refreshing() || inOverlay) {
        this.start = null;
        return;
      }
      this.start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      if (!this.start) return;
      const dy = event.touches[0].clientY - this.start.y;
      const dx = Math.abs(event.touches[0].clientX - this.start.x);
      if (event.touches.length !== 1 || view.scrollY > 0 || (dx > 12 && dx > dy)) {
        this.reset();
        return;
      }
      if (dy > 0) {
        this.dragging.set(true);
        this.pull.set(dy * 0.5);
      }
    };
    const onEnd = () => {
      if (this.start && this.pull() >= THRESHOLD) this.refresh.emit();
      this.reset();
    };
    const options = { passive: true };
    doc.addEventListener('touchstart', onStart, options);
    doc.addEventListener('touchmove', onMove, options);
    doc.addEventListener('touchend', onEnd, options);
    doc.addEventListener('touchcancel', onEnd, options);
    inject(DestroyRef).onDestroy(() => {
      doc.removeEventListener('touchstart', onStart);
      doc.removeEventListener('touchmove', onMove);
      doc.removeEventListener('touchend', onEnd);
      doc.removeEventListener('touchcancel', onEnd);
    });
  }

  private reset(): void {
    this.start = null;
    this.dragging.set(false);
    this.pull.set(0);
  }
}
