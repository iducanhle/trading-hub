// Generates the placeholder app icon in public/: icons/icon.svg, the PWA PNGs (any + maskable), the Apple touch
// icon and favicon.ico. No dependencies: a tiny supersampling rasterizer and a PNG encoder on node:zlib.
//
//   node scripts/generate-app-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1b, 0x5f, 0xb8]; // azure, close to the Material primary
const FG = [0xff, 0xff, 0xff];
// Artwork in a 512 × 512 box: a rising price line ending in a dot (an earnings marker).
const LINE = [
  [128, 340],
  [212, 256],
  [276, 308],
  [372, 200],
];
const STROKE = 40;
const DOT = { x: 384, y: 186, r: 40 };

const out = new URL('../public/', import.meta.url);
mkdirSync(new URL('icons/', out), { recursive: true });

writeFileSync(
  new URL('icons/icon.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1b5fb8"/>
  <path d="M${LINE.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="#fff" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${DOT.x}" cy="${DOT.y}" r="${DOT.r}" fill="#fff"/>
</svg>
`,
);

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/** RGBA pixels. `maskable`: full-bleed background, artwork shrunk into the 80 % safe zone. */
function render(size, { rounded, maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  const art = maskable ? 0.72 : 1; // artwork scale around the centre
  const S = 4; // 4 × 4 supersampling
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) * scale;
          const v = (y + (sy + 0.5) / S) * scale;
          if (rounded && !inRoundedRect(u, v, 512, 112)) continue;
          bg++;
          const au = 256 + (u - 256) / art;
          const av = 256 + (v - 256) / art;
          let hit = Math.hypot(au - DOT.x, av - DOT.y) <= DOT.r;
          for (let i = 0; !hit && i < LINE.length - 1; i++) {
            hit = distanceToSegment(au, av, LINE[i], LINE[i + 1]) <= STROKE / 2;
          }
          if (hit) fg++;
        }
      }
      const i = (y * size + x) * 4;
      const coverage = bg / (S * S);
      const mix = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(BG[c] + (FG[c] - BG[c]) * mix);
      pixels[i + 3] = Math.round(coverage * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  writeFileSync(
    new URL(`icons/icon-${size}x${size}.png`, out),
    png(size, render(size, { rounded: true })),
  );
}
for (const size of [192, 512]) {
  writeFileSync(
    new URL(`icons/maskable-${size}x${size}.png`, out),
    png(size, render(size, { maskable: true })),
  );
}
// iOS rounds the corners itself and shows transparency as black: full-bleed square.
writeFileSync(new URL('icons/apple-touch-icon.png', out), png(180, render(180, {})));

// favicon.ico holding one 32 × 32 PNG.
const favicon = png(32, render(32, { rounded: true }));
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // one image
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10); // colour planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(favicon.length, 14);
ico.writeUInt32LE(22, 18);
writeFileSync(new URL('favicon.ico', out), Buffer.concat([ico, favicon]));
console.log('Icons written to public/.');
