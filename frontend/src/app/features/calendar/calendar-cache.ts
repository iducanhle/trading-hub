import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';
import { ApiService, CalendarQuery } from '../../core/api/api.service';
import { CalendarResponse } from '../../core/models/contract';

/**
 * Calendar ranges already fetched in this session (no expiry: navigating back and forth never refetches; pull-to-
 * refresh clears it). Adjacent ranges are prefetched so swiping to the next week is instant.
 */
@Injectable({ providedIn: 'root' })
export class CalendarCache {
  private readonly api = inject(ApiService);
  private readonly ranges = new Map<string, Observable<CalendarResponse>>();

  load(query: CalendarQuery): Observable<CalendarResponse> {
    const key = JSON.stringify(query);
    let cached = this.ranges.get(key);
    if (!cached) {
      cached = this.api.calendar(query, { force: true }).pipe(
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
  prefetch(query: CalendarQuery): void {
    this.load(query).subscribe({ error: () => undefined });
  }

  clear(): void {
    this.ranges.clear();
  }
}
