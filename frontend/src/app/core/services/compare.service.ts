import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { SearchResult } from '../models/contract';
import { readLocal, writeLocal } from './local-store';

const KEY = 'et.compare';
/** Each stock in the list stays rendered on the compare page, so the list is kept short. */
export const COMPARE_MAX = 6;

export type CompareItem = SearchResult;

/**
 * The compare list (on this device) and the compare page's in-memory state: the stock shown and where each stock
 * was scrolled to, so switching back returns to the same spot.
 */
@Injectable({ providedIn: 'root' })
export class CompareService {
  private readonly view = inject(DOCUMENT).defaultView;

  readonly items = signal<CompareItem[]>(readLocal<CompareItem[]>(KEY, []).slice(0, COMPARE_MAX));
  private readonly selected = signal<string | null>(null);
  /** The stock shown on the compare page: the one picked last, else the first. */
  readonly active = computed(() => {
    const items = this.items();
    const picked = this.selected();
    return items.find((s) => s.symbol === picked)?.symbol ?? items[0]?.symbol ?? null;
  });
  readonly index = computed(() => this.items().findIndex((s) => s.symbol === this.active()));
  readonly full = computed(() => this.items().length >= COMPARE_MAX);

  /** Scroll offset per symbol (in memory only). */
  readonly positions = new Map<string, number>();
  /** True from a switch until the page has restored the new stock's offset, so it is not overwritten meanwhile. */
  switching = false;

  has(symbol: string): boolean {
    return this.items().some((s) => s.symbol === symbol);
  }

  /** Adds the stock and makes it the one shown; false when the list is full. */
  add(stock: SearchResult): boolean {
    if (this.has(stock.symbol)) return true;
    if (this.full()) return false;
    const entry: CompareItem = {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      region: stock.region,
      currency: stock.currency,
      logoUrl: stock.logoUrl,
    };
    this.save([...this.items(), entry]);
    this.selected.set(stock.symbol);
    this.positions.delete(stock.symbol);
    return true;
  }

  /** Removes the stock; the page then shows its right neighbour (or the new last one). */
  remove(symbol: string): void {
    const items = this.items();
    const at = items.findIndex((s) => s.symbol === symbol);
    if (at < 0) return;
    const next = items.filter((s) => s.symbol !== symbol);
    if (this.active() === symbol) {
      this.switching = true;
      this.selected.set(next[Math.min(at, next.length - 1)]?.symbol ?? null);
    }
    this.positions.delete(symbol);
    this.save(next);
  }

  /** Shows the previous (-1) or next (+1) stock, wrapping around. */
  step(delta: number): void {
    const items = this.items();
    if (items.length < 2) return;
    const at = (this.index() + delta + items.length) % items.length;
    this.select(items[at].symbol);
  }

  select(symbol: string): void {
    const current = this.active();
    if (symbol === current) return;
    if (current && this.view) this.positions.set(current, this.view.scrollY);
    this.switching = true;
    this.selected.set(symbol);
  }

  private save(items: CompareItem[]): void {
    this.items.set(items);
    writeLocal(KEY, items);
  }
}
