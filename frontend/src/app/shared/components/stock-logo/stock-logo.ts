import { Component, booleanAttribute, computed, input, linkedSignal } from '@angular/core';
import { Icon } from '../../icon/icon';
import { symbolColor, symbolInitials } from '../../utils/symbols';

/**
 * A stock's logo at a fixed size (no layout shift), as a rounded square (14 px corners at 48 px). Without a logo, or
 * when it fails to load or is too small to look sharp (16 px favicons), the ticker's initials on a colour derived from the symbol. Decorative: the symbol is always shown next to it.
 */
/** Below this natural width a logo is upscaled into a blur (Google returns 16 px favicons when it has nothing better). */
const MIN_SHARP_PX = 32;

@Component({
  selector: 'app-stock-logo',
  imports: [Icon],
  template: `
    @if (logoUrl() && !failed()) {
      @if (!loaded()) {
        <span
          class="absolute inset-0 bg-surface-container-highest"
          [style.border-radius.px]="radius()"
        ></span>
      }
      <img
        class="size-full bg-white object-contain p-[12%] ring-1 ring-outline-variant ring-inset transition-opacity duration-200"
        [class.opacity-0]="!loaded()"
        [style.border-radius.px]="radius()"
        [src]="logoUrl()"
        [width]="size()"
        [height]="size()"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        (load)="onLoad($event)"
        (error)="failed.set(true)"
      />
    } @else {
      <span
        class="flex size-full items-center justify-center font-extrabold tracking-tight text-white select-none"
        [style.background]="color()"
        [style.border-radius.px]="radius()"
        [style.font-size.px]="fontSize()"
        >{{ initials() }}</span
      >
    }
    @if (followed()) {
      @if (size() >= 32) {
        <span
          class="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-on-primary ring-2 ring-surface"
        >
          <app-icon name="star-fill" [size]="11" />
        </span>
      } @else {
        <!-- Too small for a star: a ring in the accent colour. -->
        <span
          class="absolute -inset-0.5 ring-2 ring-primary"
          [style.border-radius.px]="radius() + 2"
        ></span>
      }
    }
  `,
  host: {
    class: 'relative inline-block shrink-0',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    'aria-hidden': 'true',
  },
})
export class StockLogo {
  readonly symbol = input.required<string>();
  readonly logoUrl = input<string | null | undefined>(null);
  readonly size = input(40);
  /** Adds a small star: the user follows this stock. */
  readonly followed = input(false, { transform: booleanAttribute });

  /** Resets whenever the URL changes. */
  protected readonly failed = linkedSignal({ source: this.logoUrl, computation: () => false });
  protected readonly loaded = linkedSignal({ source: this.logoUrl, computation: () => false });
  protected readonly color = computed(() => symbolColor(this.symbol()));
  protected readonly initials = computed(() =>
    symbolInitials(this.symbol(), this.size() < 32 ? 1 : 2),
  );
  protected readonly radius = computed(() => Math.round(this.size() * 0.29));
  protected readonly fontSize = computed(() =>
    Math.round(this.size() * (this.size() < 32 ? 0.45 : 0.36)),
  );

  /** Until it loads, a neutral tile instead of a stark white square; tiny favicons fall back to initials. */
  protected onLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalWidth < MIN_SHARP_PX) this.failed.set(true);
    else this.loaded.set(true);
  }
}
