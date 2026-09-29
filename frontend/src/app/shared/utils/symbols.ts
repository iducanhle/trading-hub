// Accessible on white text (contrast ≥ 4.5:1), distinct enough to tell neighbours apart.
const PALETTE = [
  '#1d4ed8',
  '#0f766e',
  '#7c3aed',
  '#c2410c',
  '#be185d',
  '#15803d',
  '#0369a1',
  '#9333ea',
  '#b45309',
  '#475569',
  '#b91c1c',
  '#4d7c0f',
];

/** Same symbol → same colour on every device (FNV-1a hash). */
export function symbolColor(symbol: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < symbol.length; i++) {
    hash ^= symbol.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return PALETTE[(hash >>> 0) % PALETTE.length];
}

/** Letters for the logo fallback: the ticker without its exchange suffix or share class (`SAP.DE` → `SA`). */
export function symbolInitials(symbol: string, letters = 2): string {
  const base = symbol.split(/[.-]/)[0] || symbol;
  return base.slice(0, letters).toUpperCase();
}

/** Ticker without the exchange suffix, for compact labels (`SAP.DE` → `SAP`). */
export function baseSymbol(symbol: string): string {
  const dot = symbol.lastIndexOf('.');
  return dot > 0 ? symbol.slice(0, dot) : symbol;
}
