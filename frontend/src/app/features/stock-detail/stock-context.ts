import { Injectable, ResourceRef, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { LoadOptions } from '../../core/api/api.service';

/**
 * State shared by the stock page and its sections: the symbol, and a refresh counter bumped by pull-to-refresh.
 * Each section owns its own resource (and so its own loading and error state); ApiService's session cache makes
 * sections that need the same endpoint share one request.
 */
@Injectable()
export class StockContext {
  readonly symbol = signal('');
  /** 0 = use cached responses; bumped by a refresh so every section reloads from the server. */
  readonly version = signal(0);

  setSymbol(symbol: string): void {
    const canonical = symbol.trim().toUpperCase();
    if (canonical === this.symbol()) return;
    this.symbol.set(canonical);
    this.version.set(0);
  }

  refresh(): void {
    this.version.update((v) => v + 1);
  }

  /**
   * A resource for the current symbol that reloads on refresh and stays idle while `enabled` is false (collapsed
   * section). Call it in an injection context (a field initializer of a section).
   */
  resource<T>(
    load: (symbol: string, options: LoadOptions) => Observable<T>,
    enabled: () => boolean = () => true,
  ): ResourceRef<T | undefined> {
    return rxResource({
      params: () => (enabled() && this.symbol() ? { symbol: this.symbol(), version: this.version() } : undefined),
      stream: ({ params }) => load(params.symbol, { force: params.version > 0 }),
    });
  }
}
