import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CalendarResponse,
  EarningsResponse,
  EventRegionFilter,
  FollowedEarningsResponse,
  HealthResponse,
  HistoryPeriod,
  HistoryResponse,
  Importance,
  MarketEventsResponse,
  MeResponse,
  NewsItem,
  PriceInterval,
  PriceRange,
  PricesResponse,
  RecommendationPeriod,
  RegionFilter,
  SearchResult,
  StockOverview,
  T212CredentialsRequest,
  T212DividendsResponse,
  T212HoldingsResponse,
  T212AllocationResponse,
  T212DayChangesResponse,
  T212InstrumentDetail,
  T212InstrumentsResponse,
  T212PositionStatus,
  T212Side,
  T212Status,
  T212Summary,
  T212TradesResponse,
  T212TransactionType,
  T212TransactionsResponse,
  TestEmailResponse,
} from '../models/contract';
import { ResponseCache } from './response-cache';

const MINUTE = 60_000;
/** Overview (price) data is cached for 60 s, everything else for 5 min. */
const TTL = {
  overview: MINUTE,
  default: 5 * MINUTE,
  t212: MINUTE,
  t212DayChanges: 45_000,
  t212Status: 10_000,
} as const;

export interface LoadOptions {
  /** Skip the session cache (pull-to-refresh, Retry). */
  force?: boolean;
}

export interface CalendarQuery {
  from: string;
  to: string;
  minMarketCapUsd: number;
  region: RegionFilter;
  followedOnly: boolean;
}

export interface MarketEventsQuery {
  from: string;
  to: string;
  minImportance: Importance;
  region: EventRegionFilter;
  includeEarnings: boolean;
}

/** A Trading 212 period: `from`/`to` days (inclusive) in the IANA zone `tz`; both omitted = all time. */
export interface T212PeriodQuery {
  from?: string | null;
  to?: string | null;
  tz: string;
}

export interface T212TradesQuery extends T212PeriodQuery {
  side?: T212Side | null;
  ticker?: string | null;
  cursor?: string | null;
  limit?: number;
}

/** Canonical, URL-encoded symbol for a path segment (`sap.de` → `SAP.DE`, `BRK-B` stays as is). */
export function encodeSymbol(symbol: string): string {
  return encodeURIComponent(symbol.trim().toUpperCase());
}

type Params = Record<string, string | number | boolean>;

/** Leaves out null, undefined and empty values. */
function present(values: Record<string, string | number | boolean | null | undefined>): Params {
  const params: Params = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

/** One method per endpoint in docs/CONTRACT.md. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(ResponseCache);
  readonly baseUrl = `${environment.apiBaseUrl}/api`;

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`);
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.baseUrl}/me`);
  }

  search(q: string, limit = 10): Observable<SearchResult[]> {
    return this.get<SearchResult[]>('/search', { q: q.trim(), limit });
  }

  overview(symbol: string, options?: LoadOptions): Observable<StockOverview> {
    return this.get<StockOverview>(`/stocks/${encodeSymbol(symbol)}`, {}, options, TTL.overview);
  }

  /** Without `interval`, the range's default (5-minute bars for 1D, daily bars otherwise). */
  prices(
    symbol: string,
    range: PriceRange,
    interval?: PriceInterval,
    options?: LoadOptions,
  ): Observable<PricesResponse> {
    return this.get<PricesResponse>(
      `/stocks/${encodeSymbol(symbol)}/prices`,
      present({ range, interval }),
      options,
    );
  }

  history(
    symbol: string,
    period: HistoryPeriod,
    before: string | null,
    limit = 30,
    options?: LoadOptions,
  ): Observable<HistoryResponse> {
    const params: Params = { period, limit };
    if (before) params['before'] = before;
    return this.get<HistoryResponse>(`/stocks/${encodeSymbol(symbol)}/history`, params, options);
  }

  earnings(symbol: string, options?: LoadOptions): Observable<EarningsResponse> {
    return this.get<EarningsResponse>(`/stocks/${encodeSymbol(symbol)}/earnings`, {}, options);
  }

  recommendations(symbol: string, options?: LoadOptions): Observable<RecommendationPeriod[]> {
    return this.get<RecommendationPeriod[]>(
      `/stocks/${encodeSymbol(symbol)}/recommendations`,
      {},
      options,
    );
  }

  news(symbol: string, limit = 10, options?: LoadOptions): Observable<NewsItem[]> {
    return this.get<NewsItem[]>(`/stocks/${encodeSymbol(symbol)}/news`, { limit }, options);
  }

  peers(symbol: string, options?: LoadOptions): Observable<SearchResult[]> {
    return this.get<SearchResult[]>(`/stocks/${encodeSymbol(symbol)}/peers`, {}, options);
  }

  calendar(query: CalendarQuery, options?: LoadOptions): Observable<CalendarResponse> {
    return this.get<CalendarResponse>('/calendar', { ...query }, options);
  }

  marketEvents(query: MarketEventsQuery, options?: LoadOptions): Observable<MarketEventsResponse> {
    return this.get<MarketEventsResponse>('/market-events', { ...query }, options);
  }

  followedEarnings(options?: LoadOptions): Observable<FollowedEarningsResponse> {
    return this.get<FollowedEarningsResponse>('/followed/earnings', {}, options);
  }

  sendTestEmail(): Observable<TestEmailResponse> {
    return this.http.post<TestEmailResponse>(`${this.baseUrl}/notifications/test`, null);
  }

  // ─── Trading 212 ───

  t212Status(options?: LoadOptions): Observable<T212Status> {
    return this.get<T212Status>('/t212/status', {}, options, TTL.t212Status);
  }

  /** Validates and stores the key, then starts the first sync. The key is sent once and never kept here. */
  t212Connect(body: T212CredentialsRequest): Observable<T212Status> {
    this.cache.invalidate('/t212');
    return this.http.put<T212Status>(`${this.baseUrl}/t212/credentials`, body);
  }

  /** Deletes the stored key and every synced item. */
  t212Disconnect(): Observable<void> {
    this.cache.invalidate('/t212');
    return this.http.delete<void>(`${this.baseUrl}/t212/credentials`);
  }

  t212Sync(): Observable<T212Status> {
    this.cache.invalidate('/t212/status');
    return this.http.post<T212Status>(`${this.baseUrl}/t212/sync`, null);
  }

  t212Summary(query: T212PeriodQuery, options?: LoadOptions): Observable<T212Summary> {
    return this.get<T212Summary>('/t212/summary', present({ ...query }), options, TTL.t212);
  }

  t212Holdings(options?: LoadOptions): Observable<T212HoldingsResponse> {
    return this.get<T212HoldingsResponse>('/t212/holdings', {}, options, TTL.t212);
  }

  t212Allocation(options?: LoadOptions): Observable<T212AllocationResponse> {
    return this.get<T212AllocationResponse>('/t212/allocation', {}, options, TTL.t212);
  }

  /** Slow when the server has to fetch the quotes, so it is cached separately and shorter (45 s). */
  t212DayChanges(options?: LoadOptions): Observable<T212DayChangesResponse> {
    return this.get<T212DayChangesResponse>(
      '/t212/allocation/day-changes',
      {},
      options,
      TTL.t212DayChanges,
    );
  }

  t212Instruments(
    query: T212PeriodQuery & { status?: T212PositionStatus | 'ALL' },
    options?: LoadOptions,
  ): Observable<T212InstrumentsResponse> {
    return this.get<T212InstrumentsResponse>(
      '/t212/instruments',
      present({ ...query }),
      options,
      TTL.t212,
    );
  }

  t212Instrument(t212Ticker: string, options?: LoadOptions): Observable<T212InstrumentDetail> {
    return this.get<T212InstrumentDetail>(
      `/t212/instruments/${encodeURIComponent(t212Ticker)}`,
      {},
      options,
      TTL.t212,
    );
  }

  t212Trades(query: T212TradesQuery, options?: LoadOptions): Observable<T212TradesResponse> {
    return this.get<T212TradesResponse>('/t212/trades', present({ ...query }), options, TTL.t212);
  }

  t212Dividends(
    query: T212PeriodQuery & { ticker?: string | null },
    options?: LoadOptions,
  ): Observable<T212DividendsResponse> {
    return this.get<T212DividendsResponse>(
      '/t212/dividends',
      present({ ...query }),
      options,
      TTL.t212,
    );
  }

  t212Transactions(
    query: T212PeriodQuery & { type?: T212TransactionType | null },
    options?: LoadOptions,
  ): Observable<T212TransactionsResponse> {
    return this.get<T212TransactionsResponse>(
      '/t212/transactions',
      present({ ...query }),
      options,
      TTL.t212,
    );
  }

  /** Forgets cached Trading 212 responses (after a sync finished, or a key changed). */
  clearT212Cache(): void {
    this.cache.invalidate('/t212');
  }

  /** Forgets every cached response (sign-out). */
  clearCache(): void {
    this.cache.invalidate();
  }

  private get<T>(
    path: string,
    params: Params,
    options: LoadOptions = {},
    ttl: number = TTL.default,
  ): Observable<T> {
    const httpParams = new HttpParams({ fromObject: params });
    const key = `${path}?${httpParams.toString()}`;
    return this.cache.get(
      key,
      ttl,
      () => this.http.get<T>(this.baseUrl + path, { params: httpParams }),
      options.force,
    );
  }
}
