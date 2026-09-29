import { Injectable } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

interface Entry {
  expires: number;
  value: Observable<unknown>;
}

const MAX_ENTRIES = 200;

/**
 * Session cache for GET responses: navigating back and forth reuses a response for its TTL, and concurrent
 * requests for the same key share one HTTP call. Failed requests are never cached.
 */
@Injectable({ providedIn: 'root' })
export class ResponseCache {
  private readonly entries = new Map<string, Entry>();

  get<T>(key: string, ttlMs: number, load: () => Observable<T>, force = false): Observable<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (!force && hit && hit.expires > now) return hit.value as Observable<T>;

    const value: Observable<T> = load().pipe(
      catchError((error: unknown) => {
        if (this.entries.get(key)?.value === value) this.entries.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.entries.delete(key);
    this.entries.set(key, { expires: now + ttlMs, value });
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  /** Drops entries whose key starts with `prefix` (all entries without a prefix). */
  invalidate(prefix = ''): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}
