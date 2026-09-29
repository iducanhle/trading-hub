import { EarningsQuarter, EarningsResult, HistoryPeriod, HistoryRow, PriceBar, ReportTime } from '../models/contract';
import { addDays, eachDay, isWeekend, startOfMonth, startOfWeek } from '../../shared/utils/dates';

// Deterministic synthetic prices for mock mode: every symbol gets the same five years of daily bars on every run,
// ending at its fixture price, with the fixture's earnings reactions on the right days.

/** Small seeded PRNG (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

function gaussian(next: () => number): number {
  return Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The first session that reflects a report: the same day before/during the session, else the next weekday. */
export function reactionDay(date: string, time: ReportTime): string {
  if (time === 'BMO' || time === 'DMH') return isWeekend(date) ? nextWeekday(date) : date;
  return nextWeekday(date);
}

function nextWeekday(date: string): string {
  let d = addDays(date, 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

export function lastCompletedSession(today: string): string {
  let d = addDays(today, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

export interface SeriesInput {
  symbol: string;
  lastClose: number;
  avgVolume: number;
  quarters: Pick<EarningsQuarter, 'date' | 'time' | 'result' | 'reaction'>[];
  today: string;
}

export function generateBars(input: SeriesInput): PriceBar[] {
  const next = random(hashString(input.symbol));
  const end = lastCompletedSession(input.today);
  const dates = eachDay(addDays(end, -(5 * 365 + 7)), end).filter((d) => !isWeekend(d));
  const reactions = new Map<string, { result: EarningsResult | null; percent: number | null }>();
  for (const q of input.quarters) {
    reactions.set(reactionDay(q.date, q.time), { result: q.result, percent: q.reaction?.reactionDayPercent ?? null });
  }

  const returns = dates.map((date) => {
    const reaction = reactions.get(date);
    if (reaction) {
      const sign = reaction.result === 'MISS' ? -1 : 1;
      return (reaction.percent ?? sign * (2 + next() * 5)) / 100;
    }
    return gaussian(next) * 0.014 + 0.0004;
  });

  const closes = new Array<number>(dates.length);
  closes[dates.length - 1] = input.lastClose;
  for (let i = dates.length - 1; i > 0; i--) closes[i - 1] = closes[i] / (1 + returns[i]);

  return dates.map((date, i) => {
    const close = closes[i];
    const previous = i > 0 ? closes[i - 1] : close / (1 + returns[i]);
    const gap = reactions.has(date) ? returns[i] * 0.7 : gaussian(next) * 0.003;
    const open = previous * (1 + gap);
    const high = Math.max(open, close) * (1 + Math.abs(gaussian(next)) * 0.006);
    const low = Math.min(open, close) * (1 - Math.abs(gaussian(next)) * 0.006);
    const volume = Math.round(input.avgVolume * (0.6 + next() * 0.8) * (1 + Math.abs(returns[i]) * 25));
    return { date, open: round2(open), high: round2(high), low: round2(low), close: round2(close), volume };
  });
}

/** History rows, newest first, like `GET …/history` (the current period is partial). */
export function aggregateHistory(
  bars: PriceBar[],
  period: HistoryPeriod,
  reportDates: Set<string>,
  partialBar: PriceBar | null,
): HistoryRow[] {
  const all = partialBar ? [...bars, partialBar] : bars;
  const keyOf = (date: string) =>
    period === 'DAILY' ? date : period === 'WEEKLY' ? startOfWeek(date) : startOfMonth(date);

  const groups: PriceBar[][] = [];
  for (const bar of all) {
    const last = groups.at(-1);
    if (last && keyOf(last[0].date) === keyOf(bar.date)) last.push(bar);
    else groups.push([bar]);
  }

  const reportKeys = new Set([...reportDates].map(keyOf));
  const rows: HistoryRow[] = [];
  let previousClose: number | null = null;
  for (const group of groups) {
    const first = group[0];
    const last = group[group.length - 1];
    rows.push({
      periodStart: first.date,
      periodEnd: last.date,
      close: last.close,
      changePercent: previousClose == null ? null : round2(((last.close - previousClose) / previousClose) * 100),
      volume: group.reduce((sum, bar) => sum + bar.volume, 0),
      hasEarnings: reportKeys.has(keyOf(first.date)),
      partial: partialBar != null && group.includes(partialBar),
    });
    previousClose = last.close;
  }
  return rows.reverse();
}
