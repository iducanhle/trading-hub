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
  PriceRange,
  PricesResponse,
  RecommendationPeriod,
  RegionFilter,
  SearchResult,
  StockOverview,
  TestEmailResponse,
} from '../models/contract';
import { ResponseCache } from './response-cache';

const MINUTE = 60_000;
/** Overview (price) data is cached for 60 s, everything else for 5 min. */
const TTL = { overview: MINUTE, default: 5 * MINUTE } as const;

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

/** Canonical, URL-encoded symbol for a path segment (`sap.de` → `SAP.DE`, `BRK-B` stays as is). */
export function encodeSymbol(symbol: string): string {
  return encodeURIComponent(symbol.trim().toUpperCase());
}

type Params = Record<string, string | number | boolean>;

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

  prices(symbol: string, range: PriceRange, options?: LoadOptions): Observable<PricesResponse> {
    return this.get<PricesResponse>(`/stocks/${encodeSymbol(symbol)}/prices`, { range }, options);
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
