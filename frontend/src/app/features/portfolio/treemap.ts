/** A tile in percent of the treemap's width and height. */
export interface TreemapRect<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk): lays out `weights` (largest first works best) in a `width` ×
 * `height` box so that each tile's area is proportional to its weight and tiles stay close to square. Returns the
 * tiles in percent of the box, in the order given. Items with no positive weight are left out.
 */
export function squarify<T>(
  items: readonly T[],
  weight: (item: T) => number,
  width: number,
  height: number,
): TreemapRect<T>[] {
  const entries = items.map((item) => ({ item, w: weight(item) })).filter((e) => e.w > 0);
  const total = entries.reduce((sum, e) => sum + e.w, 0);
  if (!entries.length || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const areas = entries.map((e) => ({ item: e.item, area: e.w * scale }));

  const out: TreemapRect<T>[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: typeof areas = [];

  const worst = (r: typeof areas, side: number): number => {
    const sum = r.reduce((s, a) => s + a.area, 0);
    let max = 0;
    let min = Infinity;
    for (const a of r) {
      max = Math.max(max, a.area);
      min = Math.min(min, a.area);
    }
    const s2 = side * side;
    const sum2 = sum * sum;
    return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
  };

  const place = (r: typeof areas): void => {
    const sum = r.reduce((s, a) => s + a.area, 0);
    if (w >= h) {
      // A column on the left, as wide as the row needs.
      const colW = sum / h;
      let cy = y;
      for (const a of r) {
        const ah = a.area / colW;
        out.push({ item: a.item, x, y: cy, w: colW, h: ah });
        cy += ah;
      }
      x += colW;
      w -= colW;
    } else {
      // A row on top.
      const rowH = sum / w;
      let cx = x;
      for (const a of r) {
        const aw = a.area / rowH;
        out.push({ item: a.item, x: cx, y, w: aw, h: rowH });
        cx += aw;
      }
      y += rowH;
      h -= rowH;
    }
  };

  for (const a of areas) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, a], side) <= worst(row, side)) {
      row.push(a);
    } else {
      place(row);
      row = [a];
    }
  }
  if (row.length) place(row);

  return out.map((r) => ({
    item: r.item,
    x: (r.x / width) * 100,
    y: (r.y / height) * 100,
    w: (r.w / width) * 100,
    h: (r.h / height) * 100,
  }));
}
