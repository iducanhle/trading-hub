import { EarningsMarker, PriceBar } from '../../core/models/contract';
import { beatRateText } from './sections/earnings-stats';
import { calendarCells, intensity } from './sections/history-calendar';
import { periodLabel } from './sections/performance-history';
import { ChartColors, withAlpha } from './sections/price-chart/chart-colors';
import { futureSessions, placeMarkers, weekdaysAfter } from './sections/price-chart/chart-data';
import { measure, rangeChange } from './sections/price-chart/measure';
import { recommendationBars } from './sections/recommendations';

const bar = (date: string, close: number): PriceBar => ({
  date,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: 100,
});

const marker = (date: string, result: EarningsMarker['result']): EarningsMarker => ({
  date,
  reportDate: date,
  time: 'AMC',
  result,
  epsSurprisePercent: 1,
});

const colors: ChartColors = {
  text: 't',
  grid: 'g',
  crosshair: 'c',
  line: 'line',
  gain: 'gain',
  loss: 'loss',
  neutral: 'neutral',
  surface: 's',
  labelBackground: 'l',
};

describe('chart data', () => {
  // Mon 21 Sep – Fri 25 Sep 2026
  const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map((d, i) =>
    bar(d, 100 + i),
  );

  it('lists the weekdays after a date', () => {
    expect(weekdaysAfter('2026-09-25', '2026-09-30')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
  });

  it('extends the axis to a close upcoming report only', () => {
    expect(futureSessions(week, [marker('2026-09-29', 'UPCOMING')])).toEqual([
      '2026-09-28',
      '2026-09-29',
    ]);
    expect(futureSessions(week, [marker('2026-12-15', 'UPCOMING')])).toEqual([]);
    expect(futureSessions(week, [marker('2026-09-23', 'BEAT')])).toEqual([]);
  });

  it('colours and places markers', () => {
    const markers = [
      marker('2026-09-22', 'BEAT'),
      marker('2026-09-23', 'MISS'),
      marker('2026-09-24', null),
      marker('2026-09-01', 'BEAT'), // outside the loaded bars: skipped
      marker('2026-09-29', 'UPCOMING'),
    ];
    const placed = placeMarkers(week, markers, 'candles', colors, ['2026-09-28', '2026-09-29']);
    expect(placed.map((m) => [m.time, m.color, m.hollow, m.price])).toEqual([
      ['2026-09-22', 'gain', false, 99], // candles hang below the low
      ['2026-09-23', 'loss', false, 100],
      ['2026-09-24', 'neutral', false, 101],
      ['2026-09-29', 'line', true, 104], // upcoming: outlined, at the last close
    ]);
    const line = placeMarkers(week, [marker('2026-09-22', 'BEAT')], 'line', colors, []);
    expect(line[0].price).toBe(101); // line charts hang below the close
    expect(placeMarkers(week, [marker('2026-09-29', 'UPCOMING')], 'line', colors, [])).toEqual([]);
  });

  it('adds alpha to rgb colours', () => {
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgba(1, 2, 3, 0.5)');
    expect(withAlpha('#fff', 0.5)).toBe('#fff');
  });
});

describe('stock sections', () => {
  it('describes the beat rate', () => {
    expect(
      beatRateText({
        quartersAnalyzed: 8,
        beatRate: 75,
        streak: { result: 'BEAT', count: 3 },
        avgAbsReactionPercent: 6.4,
      }),
    ).toBe('6 of 8 quarters · 75%');
    expect(
      beatRateText({
        quartersAnalyzed: 0,
        beatRate: null,
        streak: null,
        avgAbsReactionPercent: null,
      }),
    ).toBeNull();
  });

  it('labels history periods', () => {
    const row = {
      periodStart: '2026-09-22',
      periodEnd: '2026-09-26',
      close: 1,
      changePercent: 1,
      volume: 1,
      hasEarnings: false,
      partial: false,
    };
    expect(periodLabel({ ...row, periodEnd: '2026-09-22' }, 'DAILY')).toMatch(/Tue/);
    expect(periodLabel(row, 'WEEKLY')).toMatch(/22\s?–\s?26|22 – 26/);
    expect(periodLabel({ ...row, periodStart: '2026-09-01' }, 'MONTHLY')).toMatch(/Sep 2026/);
  });

  it('builds recommendation bars with shares and an accessible description', () => {
    const [bar] = recommendationBars([
      { period: '2026-09', strongBuy: 2, buy: 1, hold: 1, sell: 0, strongSell: 0 },
    ]);
    expect(bar.total).toBe(4);
    expect(bar.segments.map((s) => s.percent)).toEqual([50, 25, 25, 0, 0]);
    expect(bar.description).toContain('2 strong buy, 1 buy, 1 hold, 0 sell, 0 strong sell');
  });

  it('measures the change between two points in date order', () => {
    const m = measure({ date: '2026-09-25', price: 110 }, { date: '2026-09-15', price: 100 });
    expect(m.from.date).toBe('2026-09-15');
    expect(m.percent).toBeCloseTo(10);
    expect(m.amount).toBeCloseTo(10);
    expect(m.days).toBe(10);
    expect(rangeChange([bar('2026-09-01', 50), bar('2026-09-02', 40)])?.percent).toBeCloseTo(-20);
    expect(rangeChange([bar('2026-09-01', 50)])).toBeNull();
    expect(rangeChange([bar('2026-09-01', 50), bar('2026-09-02', 60)], 40)?.percent).toBeCloseTo(
      50,
    );
  });

  it('lays out a month calendar in weekday columns', () => {
    const row = {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-01',
      close: 1,
      changePercent: 1.5,
      volume: 1,
      hasEarnings: false,
      partial: false,
    };
    // September 2026 starts on a Tuesday: one blank, then 22 weekdays.
    const cells = calendarCells('2026-09-01', [row]);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toEqual({ date: '2026-09-01', day: 1, row });
    expect(cells.filter(Boolean).length).toBe(22);
    expect(cells[2]?.row).toBeNull();
    expect([null, 0, 0.4, -2, 3, -7].map(intensity)).toEqual([0, 0, 1, 2, 3, 4]);
  });
});
