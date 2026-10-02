import { CalendarDay, EarningsEvent, MarketEvent, SearchResult } from '../core/models/contract';
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
