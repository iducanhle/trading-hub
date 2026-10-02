import { HttpParams } from '@angular/common/http';
import {
  T212Instrument,
  T212InstrumentsResponse,
  T212Status,
  T212Summary,
} from '../models/contract';
import { MockT212, MockT212Error, T212Fixture } from './mock-t212';

const trade = (
  id: string,
  executedAt: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  value: number,
  realizedPnl: number | null = null,
) => ({
  id,
  executedAt,
  t212Ticker: 'AAPL_US_EQ',
  side,
  kind: 'TRADE' as const,
  quantity,
  price: value / quantity,
  priceCurrency: 'USD',
  value,
  fees: 1,
  taxes: 0,
  fxRate: null,
  realizedPnl,
  orderType: 'MARKET' as const,
});

const fixture: T212Fixture = {
  accountCurrency: 'EUR',
  account: { totalValue: 1000, cash: 100, invested: 900, currentValue: 900, unrealizedPnl: -50 },
  instruments: [
    {
      t212Ticker: 'AAPL_US_EQ',
      symbol: 'AAPL',
      name: 'Apple',
      isin: null,
      currency: 'USD',
      logoUrl: null,
    },
  ],
  positions: [
    {
      t212Ticker: 'AAPL_US_EQ',
      quantity: 5,
      averageCost: 100,
      currentPrice: 90,
      value: 450,
      costBasis: 500,
      unrealizedPnl: -50,
    },
  ],
  trades: [
    trade('t1', '2026-01-05T15:00:00Z', 'BUY', 10, 1000),
    trade('t2', '2026-03-05T15:00:00Z', 'SELL', 5, 600), // before fees: 601 − 5 × 99.90 = +101.50
  ],
  dividends: [
    {
      id: 'd1',
      paidAt: '2026-02-10T00:00:00Z',
      t212Ticker: 'AAPL_US_EQ',
      quantity: 10,
      amount: 2,
      grossPerShare: 0.25,
      grossPerShareCurrency: 'USD',
      type: 'ORDINARY',
    },
  ],
  transactions: [
    { id: 'x1', at: '2026-01-01T10:00:00Z', type: 'DEPOSIT', amount: 2000, currency: 'EUR' },
  ],
};

const get = (mock: MockT212, path: string, params: Record<string, string> = {}) =>
  mock.route('GET', path.split('/'), new HttpParams({ fromObject: params }), null);

describe('MockT212', () => {
  let mock: MockT212;

  beforeEach(() => {
    localStorage.removeItem('mock.t212');
    mock = new MockT212(async () => structuredClone(fixture));
  });

  it('starts disconnected and refuses reads', async () => {
    const status = (await get(mock, 't212/status')) as T212Status;
    expect(status.connected).toBe(false);
    await expect(get(mock, 't212/summary')).rejects.toMatchObject({ code: 'T212_NOT_CONNECTED' });
  });

  it('rejects bad keys and missing permissions, and connects otherwise', async () => {
    const put = (apiKey: string) =>
      mock.route('PUT', ['t212', 'credentials'], new HttpParams(), {
        apiKey,
        apiSecret: 's',
        environment: 'DEMO',
      });
    await expect(put('bad-key')).rejects.toBeInstanceOf(MockT212Error);
    await expect(put('noperm-key')).rejects.toMatchObject({ code: 'T212_MISSING_PERMISSIONS' });

    const status = (await put('test-key-0000-WXYZ')) as T212Status;
    expect(status).toMatchObject({ connected: true, environment: 'DEMO', keyHint: 'WXYZ' });
    expect(status.syncState).toBe('RUNNING');
    expect(localStorage.getItem('mock.t212')).not.toContain('test-key-0000');
  });

  it('computes P/L with the backend rules', async () => {
    await mock.route('PUT', ['t212', 'credentials'], new HttpParams(), {
      apiKey: 'test-key-0000-WXYZ',
      apiSecret: null,
      environment: 'LIVE',
    });

    const all = (await get(mock, 't212/summary', { tz: 'UTC' })) as T212Summary;
    expect(all.realizedPnl).toBe(101.5);
    expect(all.fees).toBe(2);
    expect(all.dividends).toBe(2);
    expect(all.totalPnl).toBe(51.5); // 101.50 + 2 − 2 − 50 unrealized
    expect(all.includesUnrealized).toBe(true);
    expect(all.totalPnlPct).toBe(5.15); // ÷ 1,000 bought

    const march = (await get(mock, 't212/summary', {
      from: '2026-03-01',
      to: '2026-03-31',
      tz: 'Europe/Prague',
    })) as T212Summary;
    expect(march.realizedPnl).toBe(101.5); // against the January cost
    expect(march.dividends).toBe(0);
    expect(march.totalPnl).toBe(100.5);
    expect(march.totalPnlPct).toBeNull();

    const list = (await get(mock, 't212/instruments', { tz: 'UTC' })) as T212InstrumentsResponse;
    const aapl: T212Instrument = list.items[0];
    expect(aapl).toMatchObject({ status: 'OPEN', quantity: 5, totalPnl: 51.5, tradeCount: 2 });
  });
});
