/** Downscale before scanning: transparency survives it and 64² pixels is cheap. */
const PROBE_PX = 64;
/** Alpha below this counts as transparent (ignores near-opaque antialiasing noise). */
const ALPHA_THRESHOLD = 250;

const cache = new Map<string, Promise<boolean>>();

/**
 * Whether the image at `url` has any transparent pixels. Only Trading 212 logos are checked; other hosts, load errors
 * and proxy failures resolve `false`. Results are cached per URL.
 */
export function hasTransparency(url: string): Promise<boolean> {
  const probeUrl = corsUrl(url);
  if (!probeUrl) return Promise.resolve(false);
  let result = cache.get(url);
  if (!result) {
    result = probe(probeUrl).catch(() => false);
    cache.set(url, result);
  }
  return result;
}

/** Logo host whose images we check; it sends no CORS headers, so pixels are read through a CORS-enabled proxy. */
const T212_LOGO_HOST = 'trading212equities.s3.eu-central-1.amazonaws.com';

/** A CORS-readable URL for the logo, or `null` for hosts we don't check. */
function corsUrl(url: string): string | null {
  try {
    const { host, pathname } = new URL(url);
    if (host !== T212_LOGO_HOST) return null;
    return `https://images.weserv.nl/?url=${encodeURIComponent(host + pathname)}`;
  } catch {
    return null;
  }
}

async function probe(url: string): Promise<boolean> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PROBE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, PROBE_PX, PROBE_PX);
  const { data } = ctx.getImageData(0, 0, PROBE_PX, PROBE_PX);
  for (let i = 3; i < data.length; i += 4) if (data[i] < ALPHA_THRESHOLD) return true;
  return false;
}
