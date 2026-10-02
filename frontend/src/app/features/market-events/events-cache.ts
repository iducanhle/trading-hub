import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';
import { ApiService, MarketEventsQuery } from '../../core/api/api.service';
import { MarketEventsResponse } from '../../core/models/contract';

/** Same idea as the earnings calendar's cache: ranges fetched in this session, neighbours prefetched. */
@Injectable({ providedIn: 'root' })
export class MarketEventsCache {
  private readonly api = inject(ApiService);
  private readonly ranges = new Map<string, Observable<MarketEventsResponse>>();

  load(query: MarketEventsQuery): Observable<MarketEventsResponse> {
    const key = JSON.stringify(query);
    let cached = this.ranges.get(key);
    if (!cached) {
      cached = this.api.marketEvents(query, { force: true }).pipe(
        catchError((error: unknown) => {
          this.ranges.delete(key);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.ranges.set(key, cached);
    }
    return cached;
  }

  /** Loads a range in the background; failures are ignored (the range is fetched again when shown). */
  prefetch(query: MarketEventsQuery): void {
    this.load(query).subscribe({ error: () => undefined });
  }

  clear(): void {
    this.ranges.clear();
  }
}
