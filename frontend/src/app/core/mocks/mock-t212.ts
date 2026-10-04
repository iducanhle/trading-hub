import { HttpParams } from '@angular/common/http';
import {
  ApiErrorCode,
  T212CredentialsRequest,
  T212DetailTrade,
  T212Dividend,
  T212DividendsResponse,
  T212Environment,
  T212Instrument,
  T212Holding,
  T212HoldingPosition,
  T212HoldingsResponse,
  T212AllocationItem,
  T212AllocationResponse,
  T212DayChangesResponse,
  T212HistoryInterval,
  T212HistoryRange,
  T212HistoryResponse,
  T212InstrumentDetail,
  T212InstrumentRef,
  T212InstrumentsResponse,
  T212Status,
  T212Summary,
  T212Trade,
  T212TradesResponse,
  T212Transaction,
  T212TransactionsResponse,
} from '../models/contract';

/** src/assets/mocks/t212-portfolio.json */
export interface T212Fixture {
  accountCurrency: string;
  account: {
    totalValue: number;
    cash: number;
    invested: number;
    currentValue: number;
    unrealizedPnl: number;
  };
  instruments: {
    t212Ticker: string;
    symbol: string | null;
    name: string;
    isin: string | null;
    currency: string;
    logoUrl: string | null;
  }[];
  positions: {
    t212Ticker: string;
    quantity: number;
    averageCost: number;
    currentPrice: number;
    value: number;
    costBasis: number;
    unrealizedPnl: number;
  }[];
  trades: Omit<T212Trade, 'symbol' | 'name'>[];
  dividends: Omit<T212Dividend, 'symbol' | 'name'>[];
  transactions: T212Transaction[];
}

/** Money-weighted rate of return over the whole time since the first deposit, in percent (as the backend). */
function rateOfReturn(
  flows: readonly { at: string; amount: number }[],
  value: number,
): number | null {
  const now = Date.now();
  const sorted = flows.filter((f) => f.amount !== 0 && Date.parse(f.at) <= now);
  if (!sorted.length || value <= 0) return null;
  const start = Math.min(...sorted.map((f) => Date.parse(f.at)));
  const span = now - start;
  if (span <= 0) return null;
  const gap = (rate: number) =>
    sorted.reduce((s, f) => s + f.amount * (1 + rate) ** ((now - Date.parse(f.at)) / span), 0) -
    value;
  let low = -0.9999;
  let high = 1;
  while (gap(high) < 0 && high < 1e6) high *= 10;
  if (gap(low) > 0 || gap(high) < 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (gap(mid) < 0) low = mid;
    else high = mid;
  }
  return round(((low + high) / 2) * 100);
}

export class MockT212Error extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface MockState {
  connected: boolean;
  environment: T212Environment;
  keyHint: string;
  connectedAt: string;
  lastSyncAt: string | null;
  /** While now < syncUntil, the sync is "running". */
  syncUntil: number;
}

const STORAGE_KEY = 'mock.t212';
const SYNC_MS = 2500;

/**
 * Trading 212 in mock mode. Starts disconnected; connecting with any key works except:
 * a key containing "bad" → T212_INVALID_CREDENTIALS, "noperm" → T212_MISSING_PERMISSIONS. The connection is kept
 * in localStorage so a reload stays connected. The P/L figures are computed from the fixture's trades with the
 * same rules as the backend (average cost, Trading 212's realized result per sell).
 */
export class MockT212 {
  constructor(private readonly fixture: () => Promise<T212Fixture>) {}

  async route(
    method: string,
    segments: string[],
    params: HttpParams,
    body: unknown,
  ): Promise<unknown> {
    const [, resource, id] = segments;
    if (resource === 'status' && method === 'GET') return this.status();
    if (resource === 'credentials' && method === 'PUT')
      return this.connect(body as T212CredentialsRequest);
    if (resource === 'credentials' && method === 'DELETE') {
      this.save(null);
      return null;
    }
    if (resource === 'sync' && method === 'POST') {
      const state = this.requireConnected();
      if (Date.now() >= state.syncUntil) this.save({ ...state, syncUntil: Date.now() + SYNC_MS });
      return this.status();
    }
    if (method !== 'GET') throw new MockT212Error(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    this.requireConnected();
    const period = periodOf(params);
    switch (resource) {
      case 'summary':
        return this.summary(period);
      case 'holdings':
        return this.holdings();
      case 'allocation':
        return id === 'day-changes' ? this.dayChanges() : this.allocation();
      case 'history':
        return this.history(
          (params.get('range') ?? '1M') as T212HistoryRange,
          (params.get('interval') ?? '1h') as T212HistoryInterval,
        );
      case 'instruments':
        return id ? this.instrument(id) : this.instruments(period, params.get('status') ?? 'ALL');
      case 'trades':
        return this.trades(period, params);
      case 'dividends':
        return this.dividends(period, params.get('ticker'));
      case 'transactions':
        return this.transactions(period, params.get('type'));
    }
    throw new MockT212Error(404, 'NOT_FOUND', 'No such endpoint');
  }

  // ─── Connection ───

  private load(): MockState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as MockState) : null;
    } catch {
      return null;
    }
  }

  private save(state: MockState | null): void {
    try {
      if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // private mode: the connection lasts for this page only
    }
  }

  private requireConnected(): MockState {
    const state = this.load();
    if (!state?.connected)
      throw new MockT212Error(409, 'T212_NOT_CONNECTED', 'Trading 212 is not connected');
    return state;
  }

  private status(): T212Status {
    const state = this.load();
    if (!state?.connected) {
      return {
        connected: false,
        environment: null,
        keyHint: null,
        accountCurrency: null,
        credentialsValid: null,
        connectedAt: null,
        syncState: 'IDLE',
        syncStartedAt: null,
        lastSyncAt: null,
        lastError: null,
        serverIpHint: '203.0.113.7',
      };
    }
    const running = Date.now() < state.syncUntil;
    const lastSyncAt = running
      ? state.lastSyncAt
      : state.syncUntil
        ? new Date(state.syncUntil).toISOString()
        : state.lastSyncAt;
    return {
      connected: true,
      environment: state.environment,
      keyHint: state.keyHint,
      accountCurrency: 'EUR',
      credentialsValid: true,
      connectedAt: state.connectedAt,
      syncState: running ? 'RUNNING' : 'IDLE',
      syncStartedAt: state.syncUntil ? new Date(state.syncUntil - SYNC_MS).toISOString() : null,
      lastSyncAt,
      lastError: null,
      serverIpHint: '203.0.113.7',
    };
  }

  private connect(body: T212CredentialsRequest): T212Status {
    const key = body?.apiKey?.trim() ?? '';
    if (!key || !body.environment)
      throw new MockT212Error(400, 'BAD_REQUEST', 'apiKey and environment are required');
    if (key.toLowerCase().includes('bad'))
      throw new MockT212Error(
        400,
        'T212_INVALID_CREDENTIALS',
        'Trading 212 rejected the API key. Check the key, the secret, Live or Demo, and the key’s IP restriction.',
      );
    if (key.toLowerCase().includes('noperm'))
      throw new MockT212Error(
        400,
        'T212_MISSING_PERMISSIONS',
        'The API key is missing these permissions: history:orders, history:dividends. Generate a key with them in the Trading 212 app.',
      );
    const now = Date.now();
    this.save({
      connected: true,
      environment: body.environment,
      keyHint: key.length > 8 ? key.slice(-4) : '',
      connectedAt: new Date(now).toISOString(),
      lastSyncAt: null,
      syncUntil: now + SYNC_MS,
    });
    return this.status();
  }

  // ─── Reads ───

  private async summary(period: Period): Promise<T212Summary> {
    const data = await this.fixture();
    const rows = compute(data, period);
    const allTime = period.from === null && period.to === null;
    let realized = 0;
    let dividends = 0;
    let fees = 0;
    let trades = 0;
    let bought = 0;
    for (const r of rows.all) {
      realized += r.realizedPnl;
      dividends += r.dividends;
      fees += r.fees;
      trades += r.tradeCount;
      bought += r.totalBought;
    }
    const tx = data.transactions.filter((t) => inPeriod(t.at, period));
    const sum = (type: string) =>
      tx.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
    fees += Math.abs(sum('FEE'));
    const unrealized = data.account.unrealizedPnl;
    const total = realized + dividends - fees + (allTime ? unrealized : 0);
    const refs: T212InstrumentRef[] = rows.listed
      .map((r) => ({
        t212Ticker: r.instrument.t212Ticker,
        symbol: r.instrument.symbol,
        name: r.instrument.name,
        logoUrl: r.instrument.logoUrl,
        totalPnl: r.instrument.totalPnl,
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);
    const status = this.status();
    return {
      from: period.from,
      to: period.to,
      tz: period.tz,
      accountCurrency: data.accountCurrency,
      ...data.account,
      realizedPnl: round(realized),
      dividends: round(dividends),
      fees: round(fees),
      interest: round(sum('INTEREST_ON_FREE_CASH') + sum('LENDING_INTEREST')),
      deposits: round(sum('DEPOSIT')),
      withdrawals: round(Math.abs(sum('WITHDRAW'))),
      netDeposits: round(sum('DEPOSIT') + sum('WITHDRAW')),
      tradeCount: trades,
      totalPnl: round(total),
      includesUnrealized: allTime,
      totalPnlPct: allTime && bought > 0 ? round((total / bought) * 100) : null,
      rateOfReturnPct:
        allTime && data.account.totalValue !== null
          ? rateOfReturn(
              data.transactions.filter((t) => t.type === 'DEPOSIT' || t.type === 'WITHDRAW'),
              data.account.totalValue,
            )
          : null,
      best: refs[0] ?? null,
      worst: refs.length > 1 ? refs[refs.length - 1] : null,
      syncState: status.syncState,
      lastSyncAt: status.lastSyncAt,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  private async instruments(period: Period, status: string): Promise<T212InstrumentsResponse> {
    const data = await this.fixture();
    const items = compute(data, period)
      .listed.map((r) => r.instrument)
      .filter((i) => status === 'ALL' || i.status === status)
      .sort((a, b) => b.totalPnl - a.totalPnl);
    return {
      from: period.from,
      to: period.to,
      tz: period.tz,
      accountCurrency: data.accountCurrency,
      items,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  /** One pie, "Tech": all of AAPL and half of NVDA; the other half of NVDA and VUSA are outside. */
  private async holdings(): Promise<T212HoldingsResponse> {
    const data = await this.fixture();
    const inPie: Record<string, number> = { AAPL_US_EQ: 1, NVDA_US_EQ: 0.5 };
    const row = (p: T212Fixture['positions'][number], part: number): T212HoldingPosition => {
      const info = data.instruments.find((i) => i.t212Ticker === p.t212Ticker);
      return {
        t212Ticker: p.t212Ticker,
        symbol: info?.symbol ?? null,
        name: info?.name ?? p.t212Ticker,
        logoUrl: info?.logoUrl ?? null,
        quantity: p.quantity * part,
        value: round(p.value * part),
        pnl: round(p.unrealizedPnl * part),
        pnlPct: round((p.unrealizedPnl / p.costBasis) * 100),
      };
    };
    const pieRows = data.positions
      .filter((p) => inPie[p.t212Ticker])
      .map((p) => row(p, inPie[p.t212Ticker]))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const value = round(pieRows.reduce((sum, r) => sum + (r.value ?? 0), 0));
    const pnl = round(pieRows.reduce((sum, r) => sum + (r.pnl ?? 0), 0));
    const items: T212Holding[] = [
      {
        kind: 'PIE',
        pie: {
          id: 1,
          name: 'Tech',
          value,
          pnl,
          pnlPct: round((pnl / (value - pnl)) * 100),
          positions: pieRows,
        },
        position: null,
      },
      ...data.positions
        .filter((p) => (inPie[p.t212Ticker] ?? 0) < 1)
        .map((p): T212Holding => ({
          kind: 'POSITION',
          pie: null,
          position: row(p, 1 - (inPie[p.t212Ticker] ?? 0)),
        })),
    ];
    const valueOf = (h: T212Holding) => (h.pie ? h.pie.value : h.position.value) ?? 0;
    return {
      accountCurrency: data.accountCurrency,
      items: items.sort((a, b) => valueOf(b) - valueOf(a)),
      piesAvailable: true,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  /** Every position once, largest first. */
  private async allocation(): Promise<T212AllocationResponse> {
    const data = await this.fixture();
    const total = data.positions.reduce((sum, p) => sum + p.value, 0);
    const items = data.positions
      .map((p): T212AllocationItem => {
        const info = data.instruments.find((i) => i.t212Ticker === p.t212Ticker);
        return {
          t212Ticker: p.t212Ticker,
          symbol: info?.symbol ?? null,
          name: info?.name ?? p.t212Ticker,
          logoUrl: info?.logoUrl ?? null,
          value: round(p.value),
          weightPct: round((p.value / total) * 100),
        };
      })
      .sort((a, b) => b.value - a.value);
    return {
      accountCurrency: data.accountCurrency,
      total: round(total),
      items,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  /**
   * A made-up, stable random walk ending at today's account value: 45 days of 15-minute points (so ALL is
   * short, like a feature that started recently), the last of each interval (UTC). Net deposits as in the fixture.
   */
  private async history(
    range: T212HistoryRange,
    interval: T212HistoryInterval,
  ): Promise<T212HistoryResponse> {
    const data = await this.fixture();
    const end = data.account.totalValue ?? 0;
    const netDeposits = round(
      data.transactions
        .filter((t) => t.type === 'DEPOSIT' || t.type === 'WITHDRAW')
        .reduce((sum, t) => sum + t.amount, 0),
    );
    const step = 15 * 60_000;
    const now = Math.floor(Date.now() / step) * step;
    const count = 45 * 96;
    const values: number[] = new Array(count);
    let value = end;
    let seed = 42;
    for (let i = count - 1; i >= 0; i--) {
      values[i] = value;
      seed = (seed * 16807) % 2147483647;
      value = value / (1 + (seed / 2147483647 - 0.5) * 0.004);
    }
    const spanDays = { '1D': 1, '1W': 7, '1M': 31, '3M': 92, '1Y': 366, ALL: Infinity }[range];
    const bucket = { '15m': 1, '30m': 2, '1h': 4, '4h': 16, '1d': 96, '1w': 672 }[interval] * step;
    const byBucket = new Map<number, { at: number; value: number }>();
    values.forEach((v, i) => {
      const at = now - (count - 1 - i) * step;
      if (now - at > spanDays * 86_400_000) return;
      byBucket.set(Math.floor(at / bucket), { at, value: v });
    });
    return {
      range,
      interval,
      accountCurrency: data.accountCurrency,
      points: [...byBucket.values()].map((p) => ({
        at: new Date(p.at).toISOString(),
        value: round(p.value),
        netDeposits,
        profit: round(p.value - netDeposits),
      })),
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  /** Today's change is a stable made-up number per mapped ticker; the 24 largest only. */
  private async dayChanges(): Promise<T212DayChangesResponse> {
    const data = await this.fixture();
    const changes: Record<string, number> = {};
    for (const p of [...data.positions].sort((a, b) => b.value - a.value).slice(0, 24)) {
      if (!data.instruments.find((i) => i.t212Ticker === p.t212Ticker)?.symbol) continue;
      const seed = [...p.t212Ticker].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000, 7);
      changes[p.t212Ticker] = round(seed / 100 - 5);
    }
    return { changes, asOf: new Date().toISOString(), stale: false };
  }

  private async instrument(ticker: string): Promise<T212InstrumentDetail> {
    const data = await this.fixture();
    const result = compute(data, ALL_TIME);
    const row = result.all.find((r) => r.instrument.t212Ticker === ticker);
    if (!row)
      throw new MockT212Error(404, 'NOT_FOUND', `No trades, dividends or position for ${ticker}`);
    return {
      accountCurrency: data.accountCurrency,
      instrument: row.instrument,
      trades: result.trades.filter((t) => t.t212Ticker === ticker).reverse(),
      dividends: withNames(data, data.dividends)
        .filter((d) => d.t212Ticker === ticker)
        .reverse(),
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  private async trades(period: Period, params: HttpParams): Promise<T212TradesResponse> {
    const data = await this.fixture();
    const side = params.get('side');
    const tickers = (params.get('ticker') ?? '').split(',').filter(Boolean);
    const limit = Number(params.get('limit') ?? 50);
    const offset = Number(params.get('cursor') ?? 0);
    const all = compute(data, ALL_TIME)
      .trades.filter((t) => inPeriod(t.executedAt, period))
      .filter((t) => !side || t.side === side)
      .filter((t) => !tickers.length || tickers.includes(t.t212Ticker))
      .reverse()
      .map(({ positionAfter: _p, ...trade }) => trade);
    const items = all.slice(offset, offset + limit);
    return {
      items,
      nextCursor: offset + limit < all.length ? String(offset + limit) : null,
      accountCurrency: data.accountCurrency,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  private async dividends(period: Period, ticker: string | null): Promise<T212DividendsResponse> {
    const data = await this.fixture();
    const items = withNames(data, data.dividends)
      .filter((d) => inPeriod(d.paidAt, period))
      .filter((d) => !ticker || d.t212Ticker === ticker)
      .reverse();
    return {
      from: period.from,
      to: period.to,
      tz: period.tz,
      accountCurrency: data.accountCurrency,
      total: round(items.reduce((s, d) => s + d.amount, 0)),
      items,
      asOf: new Date().toISOString(),
      stale: false,
    };
  }

  private async transactions(
    period: Period,
    type: string | null,
  ): Promise<T212TransactionsResponse> {
    const data = await this.fixture();
    const inRange = data.transactions.filter((t) => inPeriod(t.at, period)).reverse();
    const sum = (kind: string) =>
      inRange.filter((t) => t.type === kind).reduce((s, t) => s + t.amount, 0);
    return {
      from: period.from,
      to: period.to,
      tz: period.tz,
      accountCurrency: data.accountCurrency,
      totals: {
        deposits: round(sum('DEPOSIT')),
        withdrawals: round(Math.abs(sum('WITHDRAW'))),
        fees: round(Math.abs(sum('FEE'))),
        interest: round(sum('INTEREST_ON_FREE_CASH') + sum('LENDING_INTEREST')),
      },
      items: inRange.filter((t) => !type || t.type === type.toUpperCase()),
      asOf: new Date().toISOString(),
      stale: false,
    };
  }
}

// ─── The engine (same rules as the backend's T212PortfolioEngine) ───

interface Period {
  from: string | null;
  to: string | null;
  tz: string;
  start: number | null;
  end: number | null;
}

const ALL_TIME: Period = { from: null, to: null, tz: 'UTC', start: null, end: null };

/** Midnight of a day in a time zone, as epoch ms. */
function startOfDayIn(date: string, tz: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return utc - (shown - utc);
}

function periodOf(params: HttpParams): Period {
  const from = params.get('from');
  const to = params.get('to');
  const tz = params.get('tz') ?? 'UTC';
  if (from && to && from > to)
    throw new MockT212Error(400, 'BAD_REQUEST', 'from must not be after to');
  const nextDay = (d: string) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return {
    from,
    to,
    tz,
    start: from ? startOfDayIn(from, tz) : null,
    end: to ? startOfDayIn(nextDay(to), tz) : null,
  };
}

function inPeriod(iso: string, period: Period): boolean {
  const t = Date.parse(iso);
  return (period.start === null || t >= period.start) && (period.end === null || t < period.end);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function withNames<T extends { t212Ticker: string }>(
  data: T212Fixture,
  items: T[],
): (T & { symbol: string | null; name: string })[] {
  return items.map((item) => {
    const info = data.instruments.find((i) => i.t212Ticker === item.t212Ticker);
    return { ...item, symbol: info?.symbol ?? null, name: info?.name ?? item.t212Ticker };
  });
}

interface Row {
  instrument: T212Instrument;
  realizedPnl: number;
  dividends: number;
  fees: number;
  tradeCount: number;
  totalBought: number;
  active: boolean;
}

function compute(
  data: T212Fixture,
  period: Period,
): { all: Row[]; listed: Row[]; trades: T212DetailTrade[] } {
  const allTime = period.from === null && period.to === null;
  const trades: T212DetailTrade[] = [];
  const rows: Row[] = [];
  const sorted = withNames(data, data.trades).sort((a, b) =>
    a.executedAt.localeCompare(b.executedAt),
  );
  for (const info of data.instruments) {
    let quantity = 0;
    let cost = 0;
    let realized = 0;
    let fees = 0;
    let count = 0;
    let totalBought = 0;
    const bought = { quantity: 0, value: 0 };
    const sold = { quantity: 0, value: 0 };
    let first: string | null = null;
    let last: string | null = null;
    for (const t of sorted.filter((x) => x.t212Ticker === info.t212Ticker)) {
      const inside = inPeriod(t.executedAt, period);
      let tradeRealized: number | null = null;
      if (t.kind !== 'TRADE' && t.value === 0) {
        quantity = Math.max(0, quantity + (t.side === 'BUY' ? t.quantity : -t.quantity));
      } else if (t.side === 'BUY') {
        quantity += t.quantity;
        cost += Math.max(0, t.value - t.fees - t.taxes); // netValue includes the fees
        totalBought += t.value;
        if (inside) {
          bought.quantity += t.quantity;
          bought.value += t.value;
        }
      } else {
        const average = quantity > 0 ? cost / quantity : 0;
        tradeRealized = t.realizedPnl ?? t.value + t.fees + t.taxes - average * t.quantity;
        cost -= average * Math.min(t.quantity, quantity);
        quantity -= t.quantity;
        if (quantity < 1e-9) {
          quantity = 0;
          cost = 0;
        }
        if (inside) {
          sold.quantity += t.quantity;
          sold.value += t.value;
          realized += tradeRealized;
        }
      }
      if (inside) {
        fees += t.fees + t.taxes;
        if (t.kind === 'TRADE') count++;
      }
      if (t.kind === 'TRADE') {
        first ??= t.executedAt;
        last = t.executedAt;
      }
      trades.push({ ...t, realizedPnl: tradeRealized, positionAfter: quantity });
    }
    const dividends = data.dividends
      .filter((d) => d.t212Ticker === info.t212Ticker && inPeriod(d.paidAt, period))
      .reduce((s, d) => s + d.amount, 0);
    const position = data.positions.find((p) => p.t212Ticker === info.t212Ticker);
    const unrealized = position?.unrealizedPnl ?? null;
    const total = realized + dividends - fees + (allTime && unrealized !== null ? unrealized : 0);
    rows.push({
      realizedPnl: realized,
      dividends,
      fees,
      tradeCount: count,
      totalBought,
      active: count > 0 || dividends > 0 || fees > 0,
      instrument: {
        t212Ticker: info.t212Ticker,
        symbol: info.symbol,
        name: info.name,
        isin: info.isin,
        logoUrl: info.logoUrl,
        instrumentCurrency: info.currency,
        status: position ? 'OPEN' : 'CLOSED',
        quantity: position?.quantity ?? 0,
        averageCost: position?.averageCost ?? null,
        currentPrice: position?.currentPrice ?? null,
        value: position?.value ?? null,
        costBasis: position?.costBasis ?? null,
        bought: { quantity: bought.quantity, value: round(bought.value) },
        sold: { quantity: sold.quantity, value: round(sold.value) },
        realizedPnl: round(realized),
        dividends: round(dividends),
        fees: round(fees),
        unrealizedPnl: unrealized,
        totalPnl: round(total),
        totalPnlPct: allTime && totalBought > 0 ? round((total / totalBought) * 100) : null,
        tradeCount: count,
        firstTradeAt: first,
        lastTradeAt: last,
      },
    });
  }
  trades.sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  return { all: rows, listed: rows.filter((r) => allTime || r.active), trades };
}
