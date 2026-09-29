import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';
import { ApiError, toApiError } from './api-error';
import { ApiService, encodeSymbol } from './api.service';
import { ResponseCache } from './response-cache';

describe('toApiError', () => {
  it('keeps the contract code and message', () => {
    const error = toApiError(
      new HttpErrorResponse({ status: 404, error: { code: 'SYMBOL_NOT_FOUND', message: 'Unknown symbol ZZZ' } }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('SYMBOL_NOT_FOUND');
    expect(error.message).toBe('Unknown symbol ZZZ');
  });

  it('maps a missing response to NETWORK and unknown bodies by status', () => {
    expect(toApiError(new HttpErrorResponse({ status: 0 })).code).toBe('NETWORK');
    expect(toApiError(new HttpErrorResponse({ status: 503, error: '<html>' })).code).toBe('UPSTREAM_UNAVAILABLE');
    expect(toApiError(new HttpErrorResponse({ status: 502 })).code).toBe('INTERNAL_ERROR');
    expect(toApiError(new Error('boom')).code).toBe('UNKNOWN');
  });
});

describe('ResponseCache', () => {
  it('shares one request per key within the TTL and refetches when forced', async () => {
    const cache = new ResponseCache();
    let calls = 0;
    const load = () => {
      calls++;
      const subject = new Subject<number>();
      queueMicrotask(() => {
        subject.next(calls);
        subject.complete();
      });
      return subject.asObservable();
    };
    const [a, b] = await Promise.all([
      firstValueFrom(cache.get('k', 60_000, load)),
      firstValueFrom(cache.get('k', 60_000, load)),
    ]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    expect(await firstValueFrom(cache.get('k', 60_000, load, true))).toBe(2);
  });

  it('never keeps failures', async () => {
    const cache = new ResponseCache();
    await expect(firstValueFrom(cache.get('k', 60_000, () => throwError(() => new Error('x'))))).rejects.toThrow('x');
    expect(await firstValueFrom(cache.get('k', 60_000, () => of(7)))).toBe(7);
  });

  it('expires entries after the TTL', async () => {
    vi.useFakeTimers();
    try {
      const cache = new ResponseCache();
      let calls = 0;
      const load = () => {
        calls++;
        return new Subject<number>();
      };
      cache.get('k', 1000, load).subscribe();
      cache.get('k', 1000, load).subscribe();
      vi.advanceTimersByTime(1001);
      cache.get('k', 1000, load).subscribe();
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('encodes symbols in paths', () => {
    expect(encodeSymbol(' sap.de ')).toBe('SAP.DE');
    expect(encodeSymbol('brk-b')).toBe('BRK-B');
    api.overview('SAP.DE').subscribe();
    http.expectOne(`${api.baseUrl}/stocks/SAP.DE`).flush({});
  });

  it('sends the contract query parameters', () => {
    api.history('AAPL', 'WEEKLY', '2026-09-01', 30).subscribe();
    http.expectOne(`${api.baseUrl}/stocks/AAPL/history?period=WEEKLY&limit=30&before=2026-09-01`).flush({ rows: [] });

    api
      .calendar({ from: '2026-09-28', to: '2026-10-04', minMarketCapUsd: 2e9, region: 'ALL', followedOnly: false })
      .subscribe();
    http
      .expectOne(
        `${api.baseUrl}/calendar?from=2026-09-28&to=2026-10-04&minMarketCapUsd=2000000000&region=ALL&followedOnly=false`,
      )
      .flush({ days: [] });
  });

  it('serves repeated GETs from the session cache', () => {
    api.earnings('AAPL').subscribe();
    http.expectOne(`${api.baseUrl}/stocks/AAPL/earnings`).flush({});
    api.earnings('AAPL').subscribe();
    http.expectNone(`${api.baseUrl}/stocks/AAPL/earnings`);
    api.earnings('AAPL', { force: true }).subscribe();
    http.expectOne(`${api.baseUrl}/stocks/AAPL/earnings`).flush({});
  });
});
