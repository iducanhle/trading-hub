import { describe, expect, it } from 'vitest';
import { T212DetailTrade } from '../../core/models/contract';
import { DEFAULT_VIEW, TimelineItem, applyView } from './instrument-filters';

const trade = (id: string, at: string, over: Partial<T212DetailTrade> = {}): TimelineItem => ({
  kind: 'trade',
  at,
  trade: {
    id,
    kind: 'TRADE',
    side: 'BUY',
    value: 100,
    realizedPnl: null,
    executedAt: at,
    ...over,
  } as T212DetailTrade,
});
const dividend = (id: string, at: string, amount: number): TimelineItem => ({
  kind: 'dividend',
  at,
  dividend: { id, paidAt: at, amount } as never,
});
const ids = (items: TimelineItem[]) =>
  items.map((i) => (i.kind === 'trade' ? i.trade.id : i.dividend.id));

const items = [
  trade('buy', '2026-05-01T10:00:00Z', { value: 500 }),
  trade('win', '2026-05-03T10:00:00Z', { side: 'SELL', value: 200, realizedPnl: 50 }),
  trade('loss', '2026-05-02T10:00:00Z', { side: 'SELL', value: 300, realizedPnl: -80 }),
  dividend('div', '2026-05-04T10:00:00Z', 5),
];

describe('applyView', () => {
  it('sorts by date, newest first, by default', () => {
    expect(ids(applyView(items, DEFAULT_VIEW))).toEqual(['div', 'win', 'loss', 'buy']);
  });

  it('reverses the direction', () => {
    const view = { ...DEFAULT_VIEW, descending: false };
    expect(ids(applyView(items, view))).toEqual(['buy', 'loss', 'win', 'div']);
  });

  it('sorts by amount', () => {
    const view = { ...DEFAULT_VIEW, sort: 'amount' } as const;
    expect(ids(applyView(items, view))).toEqual(['buy', 'loss', 'win', 'div']);
  });

  it('sorts by profit with items without one last in both directions', () => {
    const view = { ...DEFAULT_VIEW, sort: 'profit' } as const;
    expect(ids(applyView(items, view))).toEqual(['win', 'div', 'loss', 'buy']);
    expect(ids(applyView(items, { ...view, descending: false }))).toEqual([
      'loss',
      'div',
      'win',
      'buy',
    ]);
  });

  it('filters by side and hides dividends', () => {
    expect(ids(applyView(items, { ...DEFAULT_VIEW, side: 'SELL' }))).toEqual(['win', 'loss']);
    expect(ids(applyView(items, { ...DEFAULT_VIEW, side: 'BUY' }))).toEqual(['buy']);
  });
});
