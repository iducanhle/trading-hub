import {
  CalendarDay,
  EarningsEvent,
  MarketEvent,
  SearchResult,
  T212Instrument,
} from '../core/models/contract';
import {
  DEFAULT_FILTERS,
  filtersAreDefault,
  groupByTime,
  rangeFor,
  shiftAnchor,
  visibleWeekDays,
} from './calendar/calendar-model';
import {
  DEFAULT_EVENT_FILTERS,
  chronological,
  eventFiltersAreDefault,
  notableMove,
} from './market-events/events-model';
import { groupFollowed } from './followed/followed-groups';
import {
  StockSort,
  addCustomDefaults,
  displayTicker,
  filterInstruments,
  groupByDay,
  isAllTime,
  parsePeriod,
  periodParams,
  presetRange,
  shiftMonths,
  sortInstruments,
} from './portfolio/portfolio-model';

const event = (
  symbol: string,
  date: string,
  time: EarningsEvent['time'] = 'AMC',
): EarningsEvent => ({
  symbol,
  name: symbol,
  exchange: 'NYSE',
  region: 'US',
  logoUrl: null,
  date,
  time,
  fiscalQuarter: null,
  fiscalYear: null,
  currency: 'USD',
  epsEstimate: null,
  epsActual: null,
  revenueEstimate: null,
  revenueActual: null,
  marketCapUsd: null,
});

const stock = (symbol: string): SearchResult => ({
  symbol,
  name: symbol,
  exchange: 'NYSE',
  region: 'US',
  currency: 'USD',
  logoUrl: null,
});

describe('groupFollowed', () => {
  // Wednesday 30 Sep 2026: this week ends Sunday 4 Oct, next week Sunday 11 Oct.
  const today = '2026-09-30';
  const response = {
    upcoming: [
      event('MU', '2026-09-30'),
      event('NKE', '2026-10-04'),
      event('JPM', '2026-10-05'),
      event('AAPL', '2026-10-29'),
    ],
    noUpcomingDate: [stock('ASML.AS')],
  };

  it('groups by this week, next week and later, then no date', () => {
    const followed = new Map(['MU', 'NKE', 'JPM', 'AAPL', 'ASML.AS'].map((s) => [s, stock(s)]));
    const view = groupFollowed(response, followed, today);
    expect(view.groups.map((g) => [g.title, g.events.map((e) => e.symbol)])).toEqual([
      ['This week', ['MU', 'NKE']],
      ['Next week', ['JPM']],
      ['Later', ['AAPL']],
    ]);
    expect(view.noDate.map((s) => s.symbol)).toEqual(['ASML.AS']);
    expect(view.empty).toBe(false);
  });

  it('drops unfollowed stocks and lists new follows the response does not know yet', () => {
    const followed = new Map(['MU', 'SAP.DE'].map((s) => [s, stock(s)]));
    const view = groupFollowed(response, followed, today);
    expect(view.groups.flatMap((g) => g.events.map((e) => e.symbol))).toEqual(['MU']);
    expect(view.noDate.map((s) => s.symbol)).toEqual(['SAP.DE']);
  });

  it('is empty without follows', () => {
    expect(groupFollowed({ upcoming: [], noUpcomingDate: [] }, new Map(), today).empty).toBe(true);
  });
});

describe('calendar model', () => {
  it('computes week and month ranges and pages', () => {
    expect(rangeFor('week', '2026-09-30')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(rangeFor('month', '2026-09-30')).toEqual({ from: '2026-08-31', to: '2026-10-11' });
    expect(shiftAnchor('week', '2026-09-30', 1)).toBe('2026-10-05');
    expect(shiftAnchor('week', '2026-09-30', -1)).toBe('2026-09-21');
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-01');
  });

  it('shows weekend days only when they have reports', () => {
    const days: CalendarDay[] = ['28', '29', '30'].map((d) => ({
      date: `2026-09-${d}`,
      events: [],
    }));
    const week: CalendarDay[] = [
      ...days,
      { date: '2026-10-01', events: [] },
      { date: '2026-10-02', events: [] },
      { date: '2026-10-03', events: [event('X', '2026-10-03')] },
      { date: '2026-10-04', events: [] },
    ];
    expect(visibleWeekDays(week).map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('groups a day by report time', () => {
    const groups = groupByTime([
      event('A', 'd', 'AMC'),
      event('B', 'd', 'BMO'),
      event('C', 'd', 'UNKNOWN'),
      event('D', 'd', 'BMO'),
    ]);
    expect(groups.map((g) => [g.time, g.events.map((e) => e.symbol)])).toEqual([
      ['BMO', ['B', 'D']],
      ['AMC', ['A']],
      ['UNKNOWN', ['C']],
    ]);
  });

  it('knows the default filters', () => {
    expect(filtersAreDefault(DEFAULT_FILTERS)).toBe(true);
    expect(filtersAreDefault({ ...DEFAULT_FILTERS, followedOnly: true })).toBe(false);
    expect(DEFAULT_FILTERS.minMarketCapUsd).toBe(2e9);
  });
});

describe('events model', () => {
  const marketEvent = (id: string, startsAt: string | null): MarketEvent => ({
    id,
    date: '2026-10-28',
    startsAt,
    allDay: startsAt === null,
    title: id,
    label: id,
    category: 'INFLATION',
    country: 'US',
    importance: 'HIGH',
    note: null,
    moveRatio: null,
    sourceUrl: null,
    symbol: null,
    logoUrl: null,
    reportTime: null,
  });

  it('orders a day with all-day events first, then by time', () => {
    const sorted = chronological([
      marketEvent('late', '2026-10-28T18:00:00Z'),
      marketEvent('allday', null),
      marketEvent('early', '2026-10-28T12:30:00Z'),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['allday', 'early', 'late']);
  });

  it('shows weekend days of the week view only when they have events', () => {
    const days = ['28', '29', '30'].map((d) => ({
      date: `2026-09-${d}`,
      events: [] as MarketEvent[],
    }));
    const week = [
      ...days,
      { date: '2026-10-01', events: [] },
      { date: '2026-10-02', events: [] },
      { date: '2026-10-03', events: [] },
      { date: '2026-10-04', events: [marketEvent('x', null)] },
    ];
    expect(visibleWeekDays(week).map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
    ]);
  });

  it('only calls out moves clearly bigger than a normal day', () => {
    expect(notableMove(1.63)).toBe('1.6×');
    expect(notableMove(1.2)).toBe('1.2×');
    expect(notableMove(1.07)).toBeNull();
    expect(notableMove(null)).toBeNull();
  });

  it('knows the default filters', () => {
    expect(eventFiltersAreDefault(DEFAULT_EVENT_FILTERS)).toBe(true);
    expect(eventFiltersAreDefault({ ...DEFAULT_EVENT_FILTERS, region: 'EU' })).toBe(false);
    expect(eventFiltersAreDefault({ ...DEFAULT_EVENT_FILTERS, includeEarnings: false })).toBe(
      false,
    );
    expect(DEFAULT_EVENT_FILTERS.minImportance).toBe('MEDIUM');
  });
});

describe('portfolio model', () => {
  const today = '2026-10-02';
  const instrument = (
    t212Ticker: string,
    name: string,
    status: 'OPEN' | 'CLOSED',
    totalPnl: number,
    extra: Partial<T212Instrument> = {},
  ): T212Instrument => ({
    t212Ticker,
    symbol: null,
    name,
    isin: null,
    logoUrl: null,
    instrumentCurrency: 'USD',
    status,
    quantity: status === 'OPEN' ? 1 : 0,
    averageCost: null,
    currentPrice: null,
    value: null,
    costBasis: null,
    bought: { quantity: 1, value: 100 },
    sold: { quantity: 0, value: 0 },
    realizedPnl: 0,
    dividends: 0,
    fees: 0,
    unrealizedPnl: null,
    totalPnl,
    totalPnlPct: null,
    tradeCount: 1,
    firstTradeAt: null,
    lastTradeAt: null,
    ...extra,
  });

  it('turns presets into days ending today', () => {
    expect(presetRange('1M', today)).toEqual({ from: '2026-09-03', to: today });
    expect(presetRange('3M', today)).toEqual({ from: '2026-07-03', to: today });
    expect(presetRange('YTD', today)).toEqual({ from: '2026-01-01', to: today });
    expect(presetRange('1Y', today)).toEqual({ from: '2025-10-03', to: today });
    expect(presetRange('ALL', today)).toEqual({ from: null, to: null });
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(shiftMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('reads the period from the URL and writes it back', () => {
    expect(parsePeriod({}, today)).toEqual({ preset: 'ALL', from: null, to: null });
    expect(parsePeriod({ period: 'nonsense' }, today).preset).toBe('ALL');
    expect(parsePeriod({ period: 'CUSTOM', from: '2026-09-30', to: '2026-06-01' }, today)).toEqual({
      preset: 'CUSTOM',
      from: '2026-06-01',
      to: '2026-09-30',
    });
    expect(parsePeriod({ period: 'CUSTOM', from: 'bad' }, today).preset).toBe('ALL');
    const custom = parsePeriod({ period: 'CUSTOM', from: '2026-06-01' }, today);
    expect(periodParams(custom)).toEqual({ period: 'CUSTOM', from: '2026-06-01', to: null });
    expect(periodParams(parsePeriod({ period: '3M' }, today))).toEqual({
      period: '3M',
      from: null,
      to: null,
    });
    expect(addCustomDefaults(parsePeriod({}, today), today)).toEqual({
      preset: 'CUSTOM',
      ...presetRange('1M', today),
    });
    expect(isAllTime(parsePeriod({}, today))).toBe(true);
  });

  it('filters and sorts instruments', () => {
    const items = [
      instrument('AAPL_US_EQ', 'Apple', 'OPEN', -50, { value: 900, totalPnlPct: -5 }),
      instrument('MSFT_US_EQ', 'Microsoft', 'CLOSED', 250, { lastTradeAt: '2026-08-18T14:00:00Z' }),
      instrument('VUSAl_EQ', 'Vanguard S&P 500', 'OPEN', 7, {
        value: 3000,
        totalPnlPct: 2,
        lastTradeAt: '2026-07-07T09:00:00Z',
      }),
    ];
    expect(filterInstruments(items, 'OPEN', '').map((i) => i.name)).toEqual([
      'Apple',
      'Vanguard S&P 500',
    ]);
    expect(filterInstruments(items, 'ALL', 'vusa').map((i) => i.name)).toEqual([
      'Vanguard S&P 500',
    ]);
    expect(filterInstruments(items, 'CLOSED', 'apple')).toEqual([]);
    const names = (sort: StockSort) => sortInstruments(items, sort).map((i) => i.name);
    expect(names('pnl')).toEqual(['Microsoft', 'Vanguard S&P 500', 'Apple']);
    expect(names('pnlPct')).toEqual(['Vanguard S&P 500', 'Apple', 'Microsoft']); // missing last
    expect(names('value')).toEqual(['Vanguard S&P 500', 'Apple', 'Microsoft']);
    expect(names('lastTrade')).toEqual(['Microsoft', 'Vanguard S&P 500', 'Apple']);
    expect(names('name')).toEqual(['Apple', 'Microsoft', 'Vanguard S&P 500']);
  });

  it('groups by the day in the time zone and shortens tickers', () => {
    const at = ['2026-09-30T22:30:00Z', '2026-09-30T08:00:00Z', '2026-09-29T12:00:00Z'];
    expect(groupByDay(at, (x) => x, 'Europe/Prague').map((g) => [g.date, g.items.length])).toEqual([
      ['2026-10-01', 1],
      ['2026-09-30', 1],
      ['2026-09-29', 1],
    ]);
    expect(groupByDay(at, (x) => x, 'UTC').map((g) => g.items.length)).toEqual([2, 1]);
    expect(displayTicker({ symbol: 'SAP.DE', t212Ticker: 'SAPd_EQ' })).toBe('SAP.DE');
    expect(displayTicker({ symbol: null, t212Ticker: 'VUSAl_EQ' })).toBe('VUSA');
    expect(displayTicker({ symbol: null, t212Ticker: 'BRK_B_US_EQ' })).toBe('BRK-B');
  });
});
