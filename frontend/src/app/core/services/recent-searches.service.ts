import { Injectable, signal } from '@angular/core';
import { SearchResult } from '../models/contract';
import { readLocal, removeLocal, writeLocal } from './local-store';

const KEY = 'et.recentSearches';
const MAX = 10;

/** The last 10 opened stocks, newest first, on this device. */
@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  readonly items = signal<SearchResult[]>(readLocal<SearchResult[]>(KEY, []).slice(0, MAX));

  record(stock: SearchResult): void {
    const entry: SearchResult = {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      region: stock.region,
      currency: stock.currency,
      logoUrl: stock.logoUrl,
    };
    const next = [entry, ...this.items().filter((s) => s.symbol !== stock.symbol)].slice(0, MAX);
    this.items.set(next);
    writeLocal(KEY, next);
  }

  clear(): void {
    this.items.set([]);
    removeLocal(KEY);
  }
}
