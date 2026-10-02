import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  catchError,
  firstValueFrom,
  from,
  map,
  switchMap,
  throwError,
  timer,
} from 'rxjs';
import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  isWeekend,
  startOfWeek,
  todayIso,
  weekdayIndex,
} from '../../shared/utils/dates';
import { UserDataGateway } from '../data/user-data.gateway';
import {
  ApiErrorCode,
  CalendarResponse,
  EarningsEvent,
  EarningsMarker,
  EarningsResponse,
  FollowedEarningsResponse,
  HistoryPeriod,
  HistoryResponse,
  Importance,
  MarketEvent,
  MarketEventsResponse,
  NewsItem,
  PriceBar,
  PriceRange,
  PricesResponse,
  RecommendationPeriod,
  SearchResult,
  StockOverview,
} from '../models/contract';
import { MockT212, MockT212Error, T212Fixture } from './mock-t212';
import {
  aggregateHistory,
  generateBars,
  hashString,
  lastCompletedSession,
  reactionDay,
} from './mock-series';

/** The fixtures in src/assets/mocks describe the week of Monday 28 Sep 2026. */
const FIXTURE_WEEK = '2026-09-28';
const FIXTURE_SYMBOLS = ['AAPL', 'SAP.DE'];
const DAY_MS = 86_400_000;

class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface UniverseEntry extends SearchResult {
  marketCapUsd: number | null;
}

/** Moves every date in a fixture by `days` (whole weeks, so weekdays stay weekdays). */
function shiftDates<T>(value: T, days: number): T {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return addDays(value, days) as T;
    if (/^\d{4}-\d{2}$/.test(value))
      return addMonths(`${value}-01`, Math.round(days / 30.44)).slice(0, 7) as T;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value))
      return new Date(Date.parse(value) + days * DAY_MS).toISOString() as T;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, days)])) as T;
  }
  return value;
}

/**
 * The backend in mock mode: contract-shaped responses from small fixtures (AAPL, SAP.DE, one calendar week, the
 * search universe) plus deterministic generated price series. Follows come from the mock user's local data, so
 * "followed only" and the Followed page react to follow / unfollow.
 * Symbols starting with ERR answer 503, unknown symbols 404. Trading 212 is in mock-t212.ts.
 */
@Injectable({ providedIn: 'root' })
export class MockBackend {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly gateway = inject(UserDataGateway);
  private readonly fixtures = new Map<string, Promise<unknown>>();
  private readonly series = new Map<string, Promise<PriceBar[]>>();
  private readonly today = todayIso();
  private readonly shift = diffDays(FIXTURE_WEEK, startOfWeek(this.today));
  private lastTestEmail = 0;
  private readonly t212 = new MockT212(() => this.fixture<T212Fixture>('t212-portfolio.json'));

  handle(req: HttpRequest<unknown>, path: string): Observable<HttpEvent<unknown>> {
    return timer(150 + Math.random() * 350).pipe(
      switchMap(() => from(this.route(req.method, path, req.params, req.body))),
      map(
        (body) =>
          new HttpResponse({
            status: req.method === 'POST' ? 202 : req.method === 'DELETE' ? 204 : 200,
            body,
            url: req.url,
          }),
      ),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof MockError || error instanceof MockT212Error
            ? new HttpErrorResponse({
                status: error.status,
                error: { code: error.code, message: error.message },
                url: req.url,
              })
            : error,
        ),
      ),
    );
  }

  private async route(
    method: string,
    path: string,
    params: HttpParams,
    body: unknown,
  ): Promise<unknown> {
    const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
    const [first, second, third] = segments;
    if (first === 't212') return this.t212.route(method, segments, params, body);
    if (method === 'POST' && first === 'notifications' && second === 'test')
      return this.testEmail();
    if (method !== 'GET') throw new MockError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    if (first === 'health') return { status: 'UP' };
    if (first === 'me') return { uid: 'mock-user', email: 'mock@example.com', allowed: true };
    if (first === 'search')
      return this.search(params.get('q') ?? '', Number(params.get('limit') ?? 10));
    if (first === 'calendar') return this.calendar(params);
    if (first === 'market-events') return this.marketEvents(params);
    if (first === 'followed' && second === 'earnings') return this.followedEarnings();
    if (first === 'stocks' && second) {
      const symbol = second.toUpperCase();
      if (symbol.startsWith('ERR'))
        throw new MockError(503, 'UPSTREAM_UNAVAILABLE', 'Mock provider outage');
      await this.entry(symbol);
      switch (third) {
        case undefined:
          return this.overview(symbol);
        case 'prices':
          return this.prices(symbol, (params.get('range') as PriceRange | null) ?? '1Y');
        case 'history':
          return this.history(symbol, params);
        case 'earnings':
          return this.earnings(symbol);
        case 'recommendations':
          return this.stockFile<RecommendationPeriod[]>(symbol, 'recommendations', []);
        case 'news':
          return (await this.stockFile<NewsItem[]>(symbol, 'news', [])).slice(
            0,
            Number(params.get('limit') ?? 10),
          );
        case 'peers':
          return this.stockFile<SearchResult[]>(symbol, 'peers', []);
      }
    }
    throw new MockError(404, 'NOT_FOUND', 'No such endpoint');
  }

  // ─── Fixtures ─────────────────────────────────────────────────────────────────────────────────

  private fixture<T>(file: string): Promise<T> {
    let cached = this.fixtures.get(file);
    if (!cached) {
      cached = firstValueFrom(this.http.get<T>(`assets/mocks/${file}`)).then((data) =>
        shiftDates(data, this.shift),
      );
      this.fixtures.set(file, cached);
    }
    return cached.then((data) => structuredClone(data) as T);
  }

  /** A stock's own fixture, or the fallback for symbols without one. */
  private async stockFile<T>(symbol: string, file: string, fallback: T): Promise<T> {
    return FIXTURE_SYMBOLS.includes(symbol)
      ? this.fixture<T>(`stocks/${symbol}/${file}.json`)
      : fallback;
  }

  private async universe(): Promise<Map<string, UniverseEntry>> {
    const [search, week] = await Promise.all([
      this.fixture<SearchResult[]>('search.json'),
      this.fixture<CalendarResponse>('calendar-week.json'),
    ]);
    const entries = new Map<string, UniverseEntry>();
    for (const day of week.days) {
      for (const e of day.events) {
        entries.set(e.symbol, {
          ...e,
          currency: e.currency ?? 'USD',
          marketCapUsd: e.marketCapUsd,
        });
      }
    }
    for (const s of search)
      entries.set(s.symbol, { ...s, marketCapUsd: entries.get(s.symbol)?.marketCapUsd ?? null });
    return entries;
  }

  private async entry(symbol: string): Promise<UniverseEntry> {
    const entry = (await this.universe()).get(symbol);
    if (!entry) throw new MockError(404, 'SYMBOL_NOT_FOUND', `Unknown symbol ${symbol}`);
    return entry;
  }

  // ─── Stocks ───────────────────────────────────────────────────────────────────────────────────

  private async overview(symbol: string): Promise<StockOverview> {
    if (FIXTURE_SYMBOLS.includes(symbol))
      return this.fixture<StockOverview>(`stocks/${symbol}/overview.json`);
    // Any other known symbol: Apple's shape with its own identity and a price derived from the symbol.
    const [template, entry] = await Promise.all([
      this.fixture<StockOverview>('stocks/AAPL/overview.json'),
      this.entry(symbol),
    ]);
    const price = 20 + (hashString(symbol) % 480);
    const scale = price / template.quote.price;
    const cap = entry.marketCapUsd;
    return {
      ...template,
      symbol,
      name: entry.name,
      exchange: entry.exchange,
      region: entry.region,
      currency: entry.currency,
      logoUrl: entry.logoUrl,
      sector: null,
      industry: null,
      website: null,
      quote: {
        ...template.quote,
        price,
        change: +(template.quote.change * scale).toFixed(2),
        previousClose: +(template.quote.previousClose * scale).toFixed(2),
      },
      keyStats: {
        ...template.keyStats,
        marketCap: cap,
        marketCapUsd: cap,
        week52High: +(template.keyStats.week52High! * scale).toFixed(2),
        week52Low: +(template.keyStats.week52Low! * scale).toFixed(2),
      },
      nextEarnings: (await this.nextEvent(symbol)) ?? null,
    };
  }

  private async earnings(symbol: string): Promise<EarningsResponse> {
    if (FIXTURE_SYMBOLS.includes(symbol))
      return this.fixture<EarningsResponse>(`stocks/${symbol}/earnings.json`);
    const [template, entry] = await Promise.all([
      this.fixture<EarningsResponse>('stocks/AAPL/earnings.json'),
      this.entry(symbol),
    ]);
    return {
      ...template,
      upcoming: (await this.nextEvent(symbol)) ?? null,
      quarters: template.quarters.map((q) => ({ ...q, currency: entry.currency })),
    };
  }

  private async bars(symbol: string): Promise<PriceBar[]> {
    let cached = this.series.get(symbol);
    if (!cached) {
      cached = Promise.all([this.overview(symbol), this.earnings(symbol)]).then(
        ([overview, earnings]) =>
          generateBars({
            symbol,
            lastClose: overview.quote.previousClose,
            avgVolume: overview.keyStats.avgVolume ?? 1_000_000,
            quarters: earnings.quarters,
            today: this.today,
          }),
      );
      this.series.set(symbol, cached);
    }
    return cached;
  }

  /** 1D: a 6.5-hour session of 5-minute bars ending now, walking from the last close (seeded per symbol). */
  private intraday(symbol: string, currency: string, all: PriceBar[]): PricesResponse {
    const last = all[all.length - 1];
    const bars: PriceBar[] = [];
    let price = last?.close ?? 100;
    let seed = [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const start = Date.now() - 78 * 5 * 60_000;
    for (let i = 0; i < 78; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const open = price;
      price = Math.max(0.01, price * (1 + (seed / 2 ** 32 - 0.5) * 0.004));
      const time = new Date(start + i * 5 * 60_000);
      bars.push({
        date: time.toISOString().slice(0, 10),
        time: time.toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(Math.max(open, price) * 1.001 * 100) / 100,
        low: Math.round(Math.min(open, price) * 0.999 * 100) / 100,
        close: Math.round(price * 100) / 100,
        volume: 10_000 + (seed % 50_000),
      });
    }
    return {
      symbol,
      currency,
      range: '1D',
      bars,
      baseClose: last?.close ?? null,
      earningsMarkers: [],
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  private async prices(symbol: string, range: PriceRange): Promise<PricesResponse> {
    const [overview, earnings, all] = await Promise.all([
      this.overview(symbol),
      this.earnings(symbol),
      this.bars(symbol),
    ]);
    const end = lastCompletedSession(this.today);
    if (range === '1D') return this.intraday(symbol, overview.currency, all);
    const from = {
      '1W': addDays(end, -7),
      '1M': addMonths(end, -1).slice(0, 8) + end.slice(8),
      '2M': addMonths(end, -2).slice(0, 8) + end.slice(8),
      '3M': addMonths(end, -3).slice(0, 8) + end.slice(8),
      '6M': addMonths(end, -6).slice(0, 8) + end.slice(8),
      '1Y': addDays(end, -365),
      '3Y': addDays(end, -3 * 365),
      '5Y': addDays(end, -5 * 365),
    }[range];
    const bars = all.filter((b) => b.date > from);
    const before = all.filter((b) => b.date <= from);
    const markers: EarningsMarker[] = earnings.quarters
      .map((q) => ({
        date: reactionDay(q.date, q.time),
        reportDate: q.date,
        time: q.time,
        result: q.result,
        epsSurprisePercent: q.eps.surprisePercent,
      }))
      .filter((m) => bars.length > 0 && m.date >= bars[0].date && m.date <= end);
    if (earnings.upcoming) {
      markers.push({
        date: reactionDay(earnings.upcoming.date, earnings.upcoming.time),
        reportDate: earnings.upcoming.date,
        time: earnings.upcoming.time,
        result: 'UPCOMING',
        epsSurprisePercent: null,
      });
    }
    return {
      symbol,
      currency: overview.currency,
      range,
      bars,
      baseClose: before.length ? before[before.length - 1].close : null,
      earningsMarkers: markers,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  private async history(symbol: string, params: HttpParams): Promise<HistoryResponse> {
    const period = (params.get('period') as HistoryPeriod | null) ?? 'DAILY';
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? 30)));
    const before = params.get('before');
    const [overview, earnings, bars] = await Promise.all([
      this.overview(symbol),
      this.earnings(symbol),
      this.bars(symbol),
    ]);
    const partial: PriceBar | null = isWeekend(this.today)
      ? null
      : {
          date: this.today,
          open: overview.quote.previousClose,
          high: Math.max(overview.quote.previousClose, overview.quote.price),
          low: Math.min(overview.quote.previousClose, overview.quote.price),
          close: overview.quote.price,
          volume: Math.round((overview.keyStats.avgVolume ?? 1_000_000) * 0.4),
        };
    const reportDates = new Set(earnings.quarters.map((q) => q.date));
    const rows = aggregateHistory(bars, period, reportDates, partial).filter(
      (r) => !before || r.periodStart < before,
    );
    const page = rows.slice(0, limit);
    return {
      period,
      rows: page,
      nextBefore: rows.length > limit ? page[page.length - 1].periodStart : null,
    };
  }

  // ─── Calendar and followed ────────────────────────────────────────────────────────────────────

  /** The fixture week's events, repeated by weekday for any date (varied a little from week to week). */
  private async eventsOn(date: string): Promise<EarningsEvent[]> {
    const week = await this.fixture<CalendarResponse>('calendar-week.json');
    const source = week.days.find((d) => weekdayIndex(d.date) === weekdayIndex(date));
    const weekOffset = diffDays(startOfWeek(this.today), startOfWeek(date)) / 7;
    return (source?.events ?? [])
      .filter((_, i) => weekOffset === 0 || (i + weekOffset) % 4 !== 0)
      .map((e) => ({ ...e, date }));
  }

  private async calendar(params: HttpParams): Promise<CalendarResponse> {
    const from = params.get('from');
    const to = params.get('to');
    if (!from || !to || to < from || diffDays(from, to) + 1 > 42) {
      throw new MockError(400, 'BAD_REQUEST', 'from/to are required and span at most 42 days');
    }
    const minCap = Number(params.get('minMarketCapUsd') ?? 0);
    const region = params.get('region') ?? 'ALL';
    const followed = params.get('followedOnly') === 'true' ? await this.followedSymbols() : null;
    const days = await Promise.all(
      eachDay(from, to).map(async (date) => {
        const events = (await this.eventsOn(date))
          .filter((e) => minCap <= 0 || (e.marketCapUsd != null && e.marketCapUsd >= minCap))
          .filter((e) => region === 'ALL' || e.region === region)
          .filter((e) => !followed || followed.has(e.symbol))
          .sort((a, b) => (b.marketCapUsd ?? -1) - (a.marketCapUsd ?? -1));
        return { date, events };
      }),
    );
    return { from, to, days };
  }

  /** The fixture week's market events, repeated by weekday for any date. */
  private async marketEventsOn(date: string): Promise<MarketEvent[]> {
    const week = await this.fixture<MarketEventsResponse>('market-events-week.json');
    const source = week.days.find((d) => weekdayIndex(d.date) === weekdayIndex(date));
    const shift = diffDays(week.days[0].date, startOfWeek(date));
    return (source?.events ?? []).map((e) => ({
      ...shiftDates(e, shift),
      id: `${e.id}-${date}`,
      date,
    }));
  }

  private async marketEvents(params: HttpParams): Promise<MarketEventsResponse> {
    const from = params.get('from');
    const to = params.get('to');
    if (!from || !to || to < from || diffDays(from, to) + 1 > 42) {
      throw new MockError(400, 'BAD_REQUEST', 'from/to are required and span at most 42 days');
    }
    const rank: Record<Importance, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const min = rank[(params.get('minImportance') as Importance | null) ?? 'LOW'];
    const region = params.get('region') ?? 'ALL';
    const includeEarnings = params.get('includeEarnings') !== 'false';
    const days = await Promise.all(
      eachDay(from, to).map(async (date) => {
        const events = (await this.marketEventsOn(date))
          .filter((e) => includeEarnings || e.category !== 'EARNINGS')
          .filter((e) => rank[e.importance] >= min)
          .filter(
            (e) =>
              region === 'ALL' ||
              (region === 'OTHER'
                ? e.country !== 'US' && e.country !== 'EU'
                : e.country === region),
          )
          .sort((a, b) => rank[b.importance] - rank[a.importance]);
        return { date, events };
      }),
    );
    return { from, to, days };
  }

  /** The next report of a symbol: its fixture, else the (repeating) calendar within five weeks. */
  private async nextEvent(symbol: string): Promise<EarningsEvent | undefined> {
    if (FIXTURE_SYMBOLS.includes(symbol)) {
      const next = (await this.fixture<StockOverview>(`stocks/${symbol}/overview.json`))
        .nextEarnings;
      return next && next.date >= this.today ? next : undefined;
    }
    for (const date of eachDay(this.today, addDays(this.today, 35))) {
      const event = (await this.eventsOn(date)).find((e) => e.symbol === symbol);
      if (event) return event;
    }
    return undefined;
  }

  private async followedSymbols(): Promise<Set<string>> {
    const follows = await firstValueFrom(this.gateway.watchFollows('mock-user'));
    return new Set(follows.map((f) => f.symbol));
  }

  private async followedEarnings(): Promise<FollowedEarningsResponse> {
    const follows = await firstValueFrom(this.gateway.watchFollows('mock-user'));
    const universe = await this.universe();
    const upcoming: EarningsEvent[] = [];
    const noUpcomingDate: SearchResult[] = [];
    for (const f of follows) {
      const event = universe.has(f.symbol) ? await this.nextEvent(f.symbol) : undefined;
      if (event) upcoming.push(event);
      else {
        const currency = universe.get(f.symbol)?.currency ?? (f.region === 'US' ? 'USD' : 'EUR');
        noUpcomingDate.push({ ...f, currency });
      }
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    return { upcoming, noUpcomingDate };
  }

  // ─── Search and notifications ─────────────────────────────────────────────────────────────────

  private async search(q: string, limit: number): Promise<SearchResult[]> {
    const query = q.trim().toUpperCase();
    if (!query) throw new MockError(400, 'BAD_REQUEST', 'q must not be empty');
    const all = [...(await this.universe()).values()];
    const exact = all.filter((s) => s.symbol === query || s.symbol.split('.')[0] === query);
    const rest = all.filter(
      (s) =>
        !exact.includes(s) && (s.symbol.startsWith(query) || s.name.toUpperCase().includes(query)),
    );
    return [...exact, ...rest]
      .slice(0, Math.min(20, limit))
      .map(({ marketCapUsd: _cap, ...result }) => result);
  }

  private async testEmail(): Promise<{ sentTo: string }> {
    if (Date.now() - this.lastTestEmail < 60_000) {
      throw new MockError(429, 'RATE_LIMITED', 'One test email per minute');
    }
    this.lastTestEmail = Date.now();
    const user = await firstValueFrom(this.gateway.watchUser('mock-user'));
    return { sentTo: user.doc?.settings.notificationEmail ?? 'mock@example.com' };
  }
}
