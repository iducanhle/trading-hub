import { describe, expect, it } from 'vitest';
import { T212HistoryPoint } from '../../core/models/contract';
import { currentUsSession, usSession } from '../../shared/utils/dates';
import { dailyPnl, elapsedWeekdays, groupPnl, sumPnl } from './pnl-calendar-model';

/** The value at a US close (21:00 UTC is 16:00 in New York in November). */
const point = (
  date: string,
  value: number,
  netDeposits: number | null,
  time = '21:00:00',
): T212HistoryPoint => ({
  at: `${date}T${time}Z`,
  value,
  netDeposits,
  profit: netDeposits === null ? null : value - netDeposits,
});

describe('profit/loss calendar', () => {
  it('dates moments by the US session they count toward', () => {
    expect(usSession('2026-11-09T21:00:00Z')).toBe('2026-11-09'); // Monday's close
    expect(usSession('2026-11-09T21:00:01Z')).toBe('2026-11-10'); // after it: Tuesday
    expect(usSession('2026-11-06T22:00:00Z')).toBe('2026-11-09'); // Friday evening: Monday
    expect(usSession('2026-11-08T12:00:00Z')).toBe('2026-11-09'); // Sunday: Monday
    // The summary's day is Prague's: 23:30 on Monday is still Monday, 01:13 on Tuesday is Tuesday.
    expect(currentUsSession(new Date('2026-11-09T22:30:00Z'))).toBe('2026-11-09');
    expect(currentUsSession(new Date('2026-11-10T00:13:00Z'))).toBe('2026-11-10');
    expect(currentUsSession(new Date('2026-11-08T12:00:00Z'))).toBe('2026-11-06');
  });

  it('takes each session from the previous close, without deposits', () => {
    const rows = dailyPnl(
      [
        point('2026-11-05', 1000, 900), // Thu: the first point is only the base
        point('2026-11-06', 1010, 900), // Fri: +10
        point('2026-11-09', 1520, 1400), // Mon: a 500 deposit over the weekend, +10
      ],
      '2026-11-20',
    );
    expect(rows.map((r) => [r.periodStart, r.pnl])).toEqual([
      ['2026-11-06', 10],
      ['2026-11-09', 10],
    ]);
    expect(rows[0].pnlPct).toBeCloseTo(1);
    expect(rows[1].pnlPct).toBeCloseTo((10 / 1010) * 100);
  });

  it('leaves a missing session out and keeps unknown amounts null', () => {
    const rows = dailyPnl(
      [
        point('2026-11-02', 1000, 900),
        point('2026-11-04', 1020, 900), // Tue missing: Wed covers both
        point('2026-11-05', 1030, null),
      ],
      '2026-11-20',
    );
    expect(rows.map((r) => [r.periodStart, r.pnl])).toEqual([
      ['2026-11-04', 20],
      ['2026-11-05', null],
    ]);
    expect(rows[1].pnlPct).toBeNull();
  });

  it("uses the summary's figure for the current session and holds later points back", () => {
    const points = [
      point('2026-11-06', 1000, 900),
      point('2026-11-09', 1050, 900, '20:30:00'), // Monday, before the close
      point('2026-11-09', 1060, 900, '22:30:00'), // Monday after the close: Tuesday's session
    ];
    expect(dailyPnl(points, '2026-11-09', { pnl: 60, pnlPct: 6 })).toEqual([
      { periodStart: '2026-11-09', periodEnd: '2026-11-09', pnl: 60, pnlPct: 6 },
    ]);
    expect(dailyPnl(points, '2026-11-09').map((r) => r.pnl)).toEqual([50]);
    // Before the session's first point, the figure still gets its square.
    expect(dailyPnl(points.slice(0, 1), '2026-11-09', { pnl: 5, pnlPct: 0.5 })).toEqual([
      { periodStart: '2026-11-09', periodEnd: '2026-11-09', pnl: 5, pnlPct: 0.5 },
    ]);
  });

  it('adds days up per week and month, compounding the percentages', () => {
    const days = [
      { periodStart: '2026-10-30', periodEnd: '2026-10-30', pnl: 10, pnlPct: 1 },
      { periodStart: '2026-11-02', periodEnd: '2026-11-02', pnl: 20, pnlPct: 2 },
      { periodStart: '2026-11-03', periodEnd: '2026-11-03', pnl: -5, pnlPct: -0.5 },
    ];
    const weeks = groupPnl(days, 'WEEK');
    expect(weeks.map((w) => [w.periodStart, w.periodEnd, w.pnl])).toEqual([
      ['2026-10-26', '2026-10-30', 10],
      ['2026-11-02', '2026-11-06', 15],
    ]);
    expect(weeks[1].pnlPct).toBeCloseTo((1.02 * 0.995 - 1) * 100);
    const months = groupPnl(days, 'MONTH');
    expect(months.map((m) => [m.periodStart, m.periodEnd, m.pnl])).toEqual([
      ['2026-10-01', '2026-10-31', 10],
      ['2026-11-01', '2026-11-30', 15],
    ]);
    expect(sumPnl('2026-01-01', '2026-12-31', days)?.pnl).toBe(25);
    expect(sumPnl('2025-01-01', '2025-12-31', days)).toBeNull();
  });

  it('counts the weekdays of a week that have begun by today', () => {
    const monday = '2026-11-09';
    expect(elapsedWeekdays(monday, '2026-11-06')).toBe(0);
    expect(elapsedWeekdays(monday, '2026-11-09')).toBe(1);
    expect(elapsedWeekdays(monday, '2026-11-11')).toBe(3);
    expect(elapsedWeekdays(monday, '2026-11-13')).toBe(5);
    expect(elapsedWeekdays(monday, '2026-11-14')).toBe(5);
    expect(elapsedWeekdays(monday, '2026-12-01')).toBe(5);
  });
});
