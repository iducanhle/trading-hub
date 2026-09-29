import { Component, booleanAttribute, computed, input, linkedSignal } from '@angular/core';
import { Icon } from '../../icon/icon';
import { symbolColor, symbolInitials } from '../../utils/symbols';

/**
 * A stock's logo at a fixed size (no layout shift). Without a logo, or when it fails to load, a circle with the
 * ticker's initials in a colour derived from the symbol. Decorative: the symbol is always shown next to it.
 */
@Component({
  selector: 'app-stock-logo',
  imports: [Icon],
  template: `
    @if (logoUrl() && !failed()) {
      <img
        class="size-full rounded-full bg-white object-contain p-[10%] ring-1 ring-outline-variant"
        [src]="logoUrl()"
        [width]="size()"
        [height]="size()"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        (error)="failed.set(true)"
      />
    } @else {
      <span
        class="flex size-full items-center justify-center rounded-full font-semibold tracking-tight text-white select-none"
        [style.background]="color()"
        [style.font-size.px]="fontSize()"
        >{{ initials() }}</span
      >
    }
    @if (followed()) {
      <span
        class="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-on-primary ring-2 ring-surface"
      >
        <app-icon name="star-fill" [size]="11" />
      </span>
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
  protected readonly color = computed(() => symbolColor(this.symbol()));
  protected readonly initials = computed(() => symbolInitials(this.symbol(), this.size() < 32 ? 1 : 2));
  protected readonly fontSize = computed(() => Math.round(this.size() * (this.size() < 32 ? 0.45 : 0.36)));
}
