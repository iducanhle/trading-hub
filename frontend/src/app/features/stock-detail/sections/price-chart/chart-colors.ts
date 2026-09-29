/** Chart colours resolved from the theme tokens (lightweight-charts needs concrete colours, not CSS variables). */
export interface ChartColors {
  text: string;
  grid: string;
  crosshair: string;
  line: string;
  gain: string;
  loss: string;
  neutral: string;
  surface: string;
  labelBackground: string;
}

/**
 * Reads the current theme's colours by resolving the tokens on a hidden probe element (the tokens are light-dark()
 * values, which only resolve on an element with a colour scheme).
 */
export function readChartColors(host: HTMLElement): ChartColors {
  const probe = host.ownerDocument.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const colors: ChartColors = {
    text: read('--mat-sys-on-surface-variant'),
    grid: withAlpha(read('--mat-sys-outline-variant'), 0.45),
    crosshair: read('--mat-sys-outline'),
    line: read('--mat-sys-primary'),
    gain: read('--app-gain'),
    loss: read('--app-loss'),
    neutral: read('--app-neutral-mark'),
    surface: read('--mat-sys-surface'),
    labelBackground: read('--mat-sys-inverse-surface'),
  };
  probe.remove();
  return colors;
}

/** `rgb(1, 2, 3)` → `rgba(1, 2, 3, alpha)`; other formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (!match) return color;
  const [r, g, b] = match[1].split(/[\s,/]+/).map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
