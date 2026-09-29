// Mirrors docs/CONTRACT.md (v1) exactly. Change this file only together with the contract.

export type Region = 'US' | 'EU';
export type ReportTime = 'BMO' | 'AMC' | 'DMH' | 'UNKNOWN';
export type EarningsResult = 'BEAT' | 'MISS' | 'INLINE';

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  region: Region;
  currency: string;
  logoUrl: string | null;
}

export interface EarningsEvent {
  symbol: string;
  name: string;
  exchange: string;
  region: Region;
  logoUrl: string | null;
  date: string;
  time: ReportTime;
  fiscalQuarter: number | null;
  fiscalYear: number | null;
  currency: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  marketCapUsd: number | null;
}

export interface EarningsStats {
  quartersAnalyzed: number;
  /** Percent. */
  beatRate: number | null;
  streak: { result: 'BEAT' | 'MISS'; count: number } | null;
  avgAbsReactionPercent: number | null;
}

export interface Quote {
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  asOf: string;
}

export interface KeyStats {
  marketCap: number | null;
  marketCapUsd: number | null;
  week52High: number | null;
  week52Low: number | null;
  peRatio: number | null;
  epsTtm: number | null;
  avgVolume: number | null;
}

export interface Performance {
  w1: number | null;
  m1: number | null;
  ytd: number | null;
  y1: number | null;
}

export interface StockOverview {
  symbol: string;
  name: string;
  exchange: string;
  region: Region;
  currency: string;
  logoUrl: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  quote: Quote;
  keyStats: KeyStats;
  performance: Performance;
  nextEarnings: EarningsEvent | null;
  earningsStats: EarningsStats;
  asOf: string;
  stale: boolean;
}

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EarningsMarker {
  /** Reaction day: the bar where the move shows. */
  date: string;
  reportDate: string;
  time: ReportTime;
  result: EarningsResult | 'UPCOMING' | null;
  epsSurprisePercent: number | null;
}

export interface HistoryRow {
  periodStart: string;
  periodEnd: string;
  close: number;
  changePercent: number | null;
  volume: number;
  hasEarnings: boolean;
  partial: boolean;
}

export interface EarningsReaction {
  preRunUpPercent: number | null;
  gapPercent: number | null;
  reactionDayPercent: number | null;
  driftPercent: number | null;
}

export interface EarningsQuarter {
  date: string;
  time: ReportTime;
  timeAssumed: boolean;
  fiscalQuarter: number | null;
  fiscalYear: number | null;
  currency: string | null;
  eps: { estimate: number | null; actual: number | null; surprisePercent: number | null };
  revenue: { estimate: number | null; actual: number | null; surprisePercent: number | null };
  result: EarningsResult | null;
  reaction: EarningsReaction | null;
}

export interface RecommendationPeriod {
  /** YYYY-MM */
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  imageUrl: string | null;
  summary: string | null;
}

// ─── Endpoint responses ──────────────────────────────────────────────────────────────────────────

export type PriceRange = '1W' | '1M' | '6M' | '1Y' | '5Y';
export type HistoryPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type RegionFilter = 'ALL' | Region;

export interface HealthResponse {
  status: 'UP';
}

export interface MeResponse {
  uid: string;
  email: string;
  allowed: true;
}

export interface PricesResponse {
  symbol: string;
  currency: string;
  range: PriceRange;
  /** Oldest first. */
  bars: PriceBar[];
  earningsMarkers: EarningsMarker[];
  asOf: string;
  stale: boolean;
}

export interface HistoryResponse {
  period: HistoryPeriod;
  /** Newest first. */
  rows: HistoryRow[];
  nextBefore: string | null;
}

export interface EarningsResponse {
  upcoming: EarningsEvent | null;
  /** Newest first, max 12. */
  quarters: EarningsQuarter[];
  stats: EarningsStats;
  asOf: string;
  stale: boolean;
}

export interface CalendarDay {
  date: string;
  events: EarningsEvent[];
}

export interface CalendarResponse {
  from: string;
  to: string;
  days: CalendarDay[];
}

export interface FollowedEarningsResponse {
  /** date ≥ today, ascending. */
  upcoming: EarningsEvent[];
  noUpcomingDate: SearchResult[];
}

export interface TestEmailResponse {
  sentTo: string;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'NOT_ALLOWED'
  | 'SYMBOL_NOT_FOUND'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UPSTREAM_UNAVAILABLE';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}
