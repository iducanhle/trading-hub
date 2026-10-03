// Generates src/app/shared/icon/icon-paths.ts from Lucide (ISC), the outline icon set of the redesign
// (24×24 grid, stroked, round caps and joins). The app renders icons as inline SVG paths: no icon font to download,
// nothing to cache, works offline.
//
//   node scripts/generate-icons.mjs                       # fetches the SVGs from jsDelivr
//   ICONS_DIR=path/to/icons node scripts/generate-icons.mjs   # or reads an extracted lucide-static/icons folder
//
// The app keeps its own icon names (the keys below) and maps each to a Lucide icon. A key ending in "-fill" is drawn
// filled as well as stroked (only for closed shapes such as the star). Add an entry, rerun, and commit the generated file.
// Every Lucide element (circle, rect, line, polyline…) is converted to path data, so each icon is a single <path>.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = '1.50.0';
const ICONS = {
  account_balance: 'landmark',
  account_balance_wallet: 'wallet',
  account_circle: 'circle-user-round',
  add: 'plus',
  arrow_back: 'chevron-left',
  bar_chart: 'chart-column',
  block: 'ban',
  bolt: 'zap',
  'bolt-fill': 'zap',
  calendar_month: 'calendar',
  candlestick_chart: 'chart-candlestick',
  check: 'check',
  check_circle: 'circle-check',
  chevron_left: 'chevron-left',
  chevron_right: 'chevron-right',
  close: 'x',
  cloud_off: 'cloud-off',
  contrast: 'contrast',
  dark_mode: 'moon',
  delete: 'trash-2',
  error: 'circle-alert',
  event: 'calendar-days',
  history: 'history',
  how_to_vote: 'vote',
  info: 'info',
  key: 'key-round',
  keyboard_arrow_down: 'chevron-down',
  light_mode: 'sun',
  link_off: 'unlink',
  lock: 'lock',
  logout: 'log-out',
  menu: 'menu',
  mail: 'mail',
  mark_email_read: 'mail-check',
  more_vert: 'ellipsis-vertical',
  notifications: 'bell',
  open_in_new: 'external-link',
  payments: 'banknote',
  pie_chart: 'chart-pie',
  receipt_long: 'receipt-text',
  refresh: 'rotate-cw',
  savings: 'piggy-bank',
  schedule: 'clock',
  search: 'search',
  search_off: 'search-x',
  send: 'send',
  settings: 'settings',
  show_chart: 'chart-line',
  sort: 'arrow-down-up',
  straighten: 'ruler',
  swap_vert: 'arrow-up-down',
  sync: 'refresh-cw',
  trending_down: 'trending-down',
  trending_up: 'trending-up',
  star: 'star',
  'star-fill': 'star',
  tune: 'settings-2',
  visibility: 'eye',
  visibility_off: 'eye-off',
  warning: 'triangle-alert',
  work: 'briefcase',
};

async function load(name) {
  if (process.env.ICONS_DIR) return readFile(join(process.env.ICONS_DIR, `${name}.svg`), 'utf8');
  const url = `https://cdn.jsdelivr.net/npm/lucide-static@${VERSION}/icons/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${url}`);
  return res.text();
}

const num = (attrs, key, fallback) => {
  const value = attrs[key];
  if (value === undefined) {
    if (fallback === undefined) throw new Error(`missing ${key}`);
    return fallback;
  }
  return Number(value);
};
const points = (list) =>
  list
    .trim()
    .split(/[\s,]+/)
    .map(Number);

/** Path data of one SVG element. */
function toPath(tag, attrs) {
  switch (tag) {
    case 'path':
      // A leading relative "m" is absolute in its own path, but not once appended to another one: restart from the
      // origin first (a lone moveto draws nothing). Plain "M" would turn the implicit relative linetos absolute.
      return /^\s*m/.test(attrs.d) ? `M0 0${attrs.d.trim()}` : attrs.d;
    case 'circle':
    case 'ellipse': {
      const cx = num(attrs, 'cx', 0);
      const cy = num(attrs, 'cy', 0);
      const rx = tag === 'circle' ? num(attrs, 'r') : num(attrs, 'rx');
      const ry = tag === 'circle' ? rx : num(attrs, 'ry');
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
    }
    case 'rect': {
      const x = num(attrs, 'x', 0);
      const y = num(attrs, 'y', 0);
      const w = num(attrs, 'width');
      const h = num(attrs, 'height');
      const rx = Math.min(num(attrs, 'rx', num(attrs, 'ry', 0)), w / 2);
      const ry = Math.min(num(attrs, 'ry', rx), h / 2);
      if (!rx) return `M${x} ${y}h${w}v${h}h${-w}z`;
      return (
        `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}` +
        `a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}` +
        `v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}z`
      );
    }
    case 'line':
      return `M${num(attrs, 'x1')} ${num(attrs, 'y1')}L${num(attrs, 'x2')} ${num(attrs, 'y2')}`;
    case 'polyline':
    case 'polygon': {
      const p = points(attrs.points);
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === 'polygon' ? `${d}z` : d;
    }
    default:
      throw new Error(`unsupported element <${tag}>`);
  }
}

const entries = [];
for (const [key, lucide] of Object.entries(ICONS)) {
  const svg = await load(lucide);
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  const parts = [];
  for (const [, tag, rawAttrs] of body.matchAll(/<([a-z]+)\b([^>]*?)\/?>/g)) {
    const attrs = Object.fromEntries(
      [...rawAttrs.matchAll(/([a-z0-9-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
    );
    try {
      parts.push(toPath(tag, attrs));
    } catch (error) {
      throw new Error(`${key} (${lucide}): ${error.message}`);
    }
  }
  if (!parts.length) throw new Error(`${key} (${lucide}): no shapes found`);
  entries.push(`  '${key}': '${parts.join('')}',`);
}

const out = `// Generated by scripts/generate-icons.mjs from Lucide ${VERSION} (ISC). Do not edit.
// Each value is the path data of a 24×24 outline icon (viewBox "0 0 24 24"), drawn with a stroke, not a fill.
export const ICON_PATHS = {
${entries.join('\n')}
} as const;

export type IconName = keyof typeof ICON_PATHS;
`;
await writeFile(new URL('../src/app/shared/icon/icon-paths.ts', import.meta.url), out);
console.log(`Wrote ${entries.length} icons.`);
