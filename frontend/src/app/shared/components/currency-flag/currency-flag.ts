import { Component, computed, input } from '@angular/core';

/** Twelve stars on a circle, for the EU flag. */
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  return { x: 12 + 6.2 * Math.sin(angle), y: 12 - 6.2 * Math.cos(angle) };
});

/**
 * A currency's flag as a round badge (simplified shapes that stay legible at 20 px), with a hairline ring so light
 * flags keep their edge on light surfaces. Unknown currencies show the code on a neutral disc. Decorative.
 */
@Component({
  selector: 'app-currency-flag',
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" focusable="false">
      <defs>
        <clipPath [attr.id]="clipId">
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g [attr.clip-path]="'url(#' + clipId + ')'">
        @switch (code()) {
          @case ('CZK') {
            <rect width="24" height="12" fill="#fff" />
            <rect y="12" width="24" height="12" fill="#d7141a" />
            <path d="M0 0 L13 12 L0 24 Z" fill="#11457e" />
          }
          @case ('EUR') {
            <rect width="24" height="24" fill="#003399" />
            @for (s of stars; track $index) {
              <circle [attr.cx]="s.x" [attr.cy]="s.y" r="1.05" fill="#ffcc00" />
            }
          }
          @case ('USD') {
            <rect width="24" height="24" fill="#fff" />
            @for (y of usStripes; track y) {
              <rect [attr.y]="y" width="24" height="1.85" fill="#b22234" />
            }
            <rect width="12" height="12.95" fill="#3c3b6e" />
            @for (d of usStars; track $index) {
              <circle [attr.cx]="d[0]" [attr.cy]="d[1]" r=".7" fill="#fff" />
            }
          }
          @case ('GBP') {
            <rect width="24" height="24" fill="#012169" />
            <path d="M0 0 L24 24 M24 0 L0 24" stroke="#fff" stroke-width="4.8" />
            <path d="M0 0 L24 24 M24 0 L0 24" stroke="#c8102e" stroke-width="1.6" />
            <path d="M12 0 V24 M0 12 H24" stroke="#fff" stroke-width="7" />
            <path d="M12 0 V24 M0 12 H24" stroke="#c8102e" stroke-width="4" />
          }
          @case ('CHF') {
            <rect width="24" height="24" fill="#da291c" />
            <path d="M10 5.5 h4 v4.5 h4.5 v4 H14 v4.5 h-4 V14 H5.5 v-4 H10 Z" fill="#fff" />
          }
          @case ('PLN') {
            <rect width="24" height="12" fill="#fff" />
            <rect y="12" width="24" height="12" fill="#dc143c" />
          }
          @case ('SEK') {
            <rect width="24" height="24" fill="#006aa7" />
            <path d="M9 0 V24 M0 12 H24" stroke="#fecc00" stroke-width="3.6" />
          }
          @case ('NOK') {
            <rect width="24" height="24" fill="#ba0c2f" />
            <path d="M9 0 V24 M0 12 H24" stroke="#fff" stroke-width="5.6" />
            <path d="M9 0 V24 M0 12 H24" stroke="#00205b" stroke-width="2.8" />
          }
          @case ('DKK') {
            <rect width="24" height="24" fill="#c8102e" />
            <path d="M9 0 V24 M0 12 H24" stroke="#fff" stroke-width="3.6" />
          }
          @default {
            <rect width="24" height="24" fill="var(--mat-sys-surface-container-highest)" />
            <text
              x="12"
              y="15.2"
              text-anchor="middle"
              font-size="8"
              font-weight="700"
              fill="var(--mat-sys-on-surface-variant)"
            >
              {{ code() }}
            </text>
          }
        }
      </g>
      <circle
        cx="12"
        cy="12"
        r="11.6"
        fill="none"
        stroke="var(--mat-sys-on-surface)"
        stroke-opacity=".14"
        stroke-width=".8"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class CurrencyFlag {
  private static nextId = 0;

  readonly currency = input.required<string | null>();
  readonly size = input(22);

  protected readonly code = computed(() => (this.currency() ?? '').slice(0, 3).toUpperCase());
  protected readonly clipId = `currency-flag-${CurrencyFlag.nextId++}`;
  protected readonly stars = EU_STARS;
  /** The seven red stripes of the US flag (of thirteen). */
  protected readonly usStripes = [0, 3.7, 7.4, 11.1, 14.8, 18.5, 22.2];
  protected readonly usStars = [
    [3, 3],
    [6, 3],
    [9, 3],
    [4.5, 6.3],
    [7.5, 6.3],
    [3, 9.6],
    [6, 9.6],
    [9, 9.6],
  ];
}
