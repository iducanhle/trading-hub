import { describe, expect, it } from 'vitest';
import { squarify } from './treemap';

const area = (r: { w: number; h: number }) => (r.w * r.h) / 100;

describe('squarify', () => {
  it('gives each tile an area proportional to its weight and fills the box', () => {
    const weights = [6, 6, 4, 3, 2, 2, 1];
    const tiles = squarify(weights, (w) => w, 300, 200);

    expect(tiles.map((t) => t.item)).toEqual(weights);
    const total = weights.reduce((s, w) => s + w, 0);
    for (const t of tiles) expect(area(t)).toBeCloseTo((t.item / total) * 100, 6);
    expect(tiles.reduce((s, t) => s + area(t), 0)).toBeCloseTo(100, 6);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('starts with a column on the long side', () => {
    const [first] = squarify([6, 6, 4, 3, 2, 2, 1], (w) => w, 300, 200);

    expect(first.x).toBe(0);
    expect(first.y).toBe(0);
    expect(first.h).toBeGreaterThan(first.w * (200 / 300));
  });

  it('leaves out items without weight', () => {
    expect(squarify([0, -1, 5], (w) => w, 100, 100).map((t) => t.item)).toEqual([5]);
    expect(squarify([], (w: number) => w, 100, 100)).toEqual([]);
  });

  it('gives a single item the whole box', () => {
    expect(squarify([3], (w) => w, 100, 50)).toEqual([{ item: 3, x: 0, y: 0, w: 100, h: 100 }]);
  });
});
