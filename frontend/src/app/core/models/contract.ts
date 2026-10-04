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
  /**
   * Start of an intraday bar (ISO); null or absent for daily and weekly bars (a weekly bar is dated by its last
   * session).
   */
  time?: string | null;
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

export type PriceRange = '1D' | '1W' | '1M' | '2M' | '3M' | '6M' | '1Y' | '3Y' | '5Y';
/** Bar size of the price chart; each range allows only some (see CONTRACT.md). */
export type PriceInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1wk';
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
  interval: PriceInterval;
  /** Oldest first. */
  bars: PriceBar[];
  /** The last close before the range: the range's change is measured from it. Null without older data. */
  baseClose: number | null;
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

export type EventCategory =
  | 'CENTRAL_BANK'
  | 'INFLATION'
  | 'JOBS'
  | 'GROWTH'
  | 'TREASURY'
  | 'MARKET_STRUCTURE'
  | 'EARNINGS'
  | 'POLITICS';
export type Importance = 'LOW' | 'MEDIUM' | 'HIGH';
/** `OTHER` is every country besides the US and the euro area. */
export type EventRegionFilter = 'ALL' | 'US' | 'EU' | 'OTHER';

export interface MarketEvent {
  id: string;
  /** The day in the publisher's own time zone. */
  date: string;
  /** UTC instant; null when `allDay`. */
  startsAt: string | null;
  allDay: boolean;
  /** English. */
  title: string;
  /** Short, for tiles: "CPI", "FOMC". English. */
  label: string;
  category: EventCategory;
  country: 'US' | 'EU' | 'GB' | 'JP';
  importance: Importance;
  note: string | null;
  /** S&P 500 median move on such days ÷ an ordinary day. */
  moveRatio: number | null;
  sourceUrl: string | null;
  /** EARNINGS events only. */
  symbol: string | null;
  logoUrl: string | null;
  reportTime: ReportTime | null;
}

export interface MarketEventDay {
  date: string;
  events: MarketEvent[];
}

export interface MarketEventsResponse {
  from: string;
  to: string;
  days: MarketEventDay[];
}

export interface FollowedEarningsResponse {
  /** date ≥ today, ascending. */
  upcoming: EarningsEvent[];
  noUpcomingDate: SearchResult[];
}

export interface TestEmailResponse {
  sentTo: string;
}

// ─── Trading 212 (per user). Money is in the account currency unless a field says otherwise. ───

export type T212Environment = 'LIVE' | 'DEMO';
export type T212SyncState = 'IDLE' | 'RUNNING' | 'FAILED';
export type T212Side = 'BUY' | 'SELL';
export type T212PositionStatus = 'OPEN' | 'CLOSED';
/** CORPORATE_ACTION: any other non-trade fill (distributions, spin-offs, …). */
export type T212TradeKind = 'TRADE' | 'STOCK_SPLIT' | 'CORPORATE_ACTION';
export type T212TransactionType =
  'DEPOSIT' | 'WITHDRAW' | 'FEE' | 'TRANSFER' | 'INTEREST_ON_FREE_CASH' | 'LENDING_INTEREST';

export interface T212Status {
  connected: boolean;
  environment: T212Environment | null;
  /** Last 4 characters of the API key; never the key or secret. */
  keyHint: string | null;
  accountCurrency: string | null;
  /** False once Trading 212 rejects the stored key; null when not connected. */
  credentialsValid: boolean | null;
  connectedAt: string | null;
  /** IDLE when not connected. */
  syncState: T212SyncState;
  syncStartedAt: string | null;
  lastSyncAt: string | null;
  lastError: { code: string; message: string } | null;
  /** The server's IP, to restrict the key to. */
  serverIpHint: string | null;
}

export interface T212CredentialsRequest {
  apiKey: string;
  /** null or "" for legacy keys without a secret. */
  apiSecret: string | null;
  environment: T212Environment;
}

export interface T212InstrumentRef {
  t212Ticker: string;
  symbol: string | null;
  name: string;
  logoUrl: string | null;
  totalPnl: number;
}

/** A period: `from`/`to` days in `tz`; both null = all time. */
export interface T212PeriodEcho {
  from: string | null;
  to: string | null;
  tz: string;
}

export interface T212Summary extends T212PeriodEcho {
  accountCurrency: string;
  /** As of now (live); null when Trading 212 is unavailable and nothing is cached. */
  totalValue: number | null;
  cash: number | null;
  /** Cost basis of holdings. */
  invested: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  /** In the period. */
  realizedPnl: number;
  dividends: number;
  /** Trade fees + taxes + FEE transactions. */
  fees: number;
  interest: number;
  deposits: number;
  withdrawals: number;
  netDeposits: number;
  tradeCount: number;
  /** realized + dividends − fees, plus unrealizedPnl only when includesUnrealized. */
  totalPnl: number;
  includesUnrealized: boolean;
  /** All time only. */
  totalPnlPct: number | null;
  /** All time only: money-weighted rate of return of deposits and withdrawals, as Trading 212 shows it. */
  rateOfReturnPct: number | null;
  best: T212InstrumentRef | null;
  worst: T212InstrumentRef | null;
  syncState: T212SyncState;
  lastSyncAt: string | null;
  asOf: string;
  stale: boolean;
}

export interface T212Instrument {
  /** "AAPL_US_EQ" */
  t212Ticker: string;
  /** App symbol; null when unmapped (no stock-detail link). */
  symbol: string | null;
  name: string;
  isin: string | null;
  logoUrl: string | null;
  /** Prices below are in this currency (LSE pence normalized to GBP). */
  instrumentCurrency: string | null;
  status: T212PositionStatus;
  /** Held now; 0 when CLOSED. */
  quantity: number;
  /** Instrument currency, OPEN only. */
  averageCost: number | null;
  currentPrice: number | null;
  /** Account currency, OPEN only, as of now. */
  value: number | null;
  costBasis: number | null;
  /** In the period. */
  bought: { quantity: number; value: number };
  sold: { quantity: number; value: number };
  realizedPnl: number;
  dividends: number;
  fees: number;
  /** OPEN only, as of now. */
  unrealizedPnl: number | null;
  totalPnl: number;
  /** All time only. */
  totalPnlPct: number | null;
  tradeCount: number;
  /** All time. */
  firstTradeAt: string | null;
  lastTradeAt: string | null;
}

export interface T212InstrumentsResponse extends T212PeriodEcho {
  accountCurrency: string;
  /** Sorted by totalPnl, highest first. */
  items: T212Instrument[];
  asOf: string;
  stale: boolean;
}

export interface T212Trade {
  id: string;
  executedAt: string;
  t212Ticker: string;
  symbol: string | null;
  name: string;
  side: T212Side;
  kind: T212TradeKind;
  /** Always positive. */
  quantity: number;
  /** Instrument currency (pence normalized). */
  price: number | null;
  priceCurrency: string | null;
  /** Account currency, always positive. */
  value: number;
  fees: number;
  taxes: number;
  fxRate: number | null;
  /** SELL only, before fees and taxes. */
  realizedPnl: number | null;
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | null;
}

export interface T212DetailTrade extends T212Trade {
  /** Shares held right after this trade. */
  positionAfter: number;
}

export interface T212Dividend {
  id: string;
  paidAt: string;
  t212Ticker: string;
  symbol: string | null;
  name: string;
  /** Shares the dividend was paid on. */
  quantity: number;
  /** Net, account currency. */
  amount: number;
  grossPerShare: number | null;
  grossPerShareCurrency: string | null;
  type: string;
}

export interface T212Transaction {
  id: string;
  at: string;
  type: T212TransactionType;
  /** Signed: negative = money out. */
  amount: number;
  currency: string;
}

export interface T212InstrumentDetail {
  accountCurrency: string;
  /** All time. */
  instrument: T212Instrument;
  /** Newest first. */
  trades: T212DetailTrade[];
  dividends: T212Dividend[];
  asOf: string;
  stale: boolean;
}

export interface T212TradesResponse {
  /** Newest first. */
  items: T212Trade[];
  nextCursor: string | null;
  accountCurrency: string;
  asOf: string;
  stale: boolean;
}

export interface T212DividendsResponse extends T212PeriodEcho {
  accountCurrency: string;
  total: number;
  items: T212Dividend[];
  asOf: string;
  stale: boolean;
}

/** An open position, the part of it outside pies, or one instrument of a pie. Money is as of now. */
export interface T212HoldingPosition {
  t212Ticker: string;
  symbol: string | null;
  name: string;
  logoUrl: string | null;
  quantity: number;
  value: number | null;
  /** Unrealized result. */
  pnl: number | null;
  pnlPct: number | null;
}

/** One instrument held now, inside and outside pies together. */
export interface T212AllocationItem {
  t212Ticker: string;
  symbol: string | null;
  name: string;
  logoUrl: string | null;
  value: number;
  /** Share of all open positions' value, in percent. */
  weightPct: number;
}

export interface T212AllocationResponse {
  accountCurrency: string;
  total: number;
  /** Largest value first. */
  items: T212AllocationItem[];
  asOf: string;
  stale: boolean;
}

export type T212HistoryRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
/** The chart step; each range offers some (docs/CONTRACT.md). */
export type T212HistoryInterval = '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

/** The account value at one stored moment (snapshots every 15 minutes since the feature shipped). */
export interface T212HistoryPoint {
  at: string;
  value: number;
  /** Deposits minus withdrawals up to `at`; null when one could not be converted to the account currency. */
  netDeposits: number | null;
  /** value − netDeposits. */
  profit: number | null;
}

export interface T212HistoryResponse {
  range: T212HistoryRange;
  interval: T212HistoryInterval;
  accountCurrency: string | null;
  /** Oldest first: the last point of each interval. */
  points: T212HistoryPoint[];
  asOf: string;
  stale: boolean;
}

export interface T212DayChangesResponse {
  /** Today's price change in percent by `t212Ticker`; only the 24 largest positions, mapped and quoted. */
  changes: Record<string, number>;
  asOf: string;
  stale: boolean;
}

export interface T212Pie {
  /** id and name are null when the pies could not be read and the pie positions are grouped. */
  id: number | null;
  name: string | null;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** Largest value first. */
  positions: T212HoldingPosition[];
}

export type T212Holding =
  | { kind: 'PIE'; pie: T212Pie; position: null }
  | { kind: 'POSITION'; pie: null; position: T212HoldingPosition };

export interface T212HoldingsResponse {
  accountCurrency: string;
  /** Largest value first. */
  items: T212Holding[];
  /** false when Trading 212's pie endpoints failed and the pie positions were grouped into one unnamed pie. */
  piesAvailable: boolean;
  asOf: string;
  stale: boolean;
}

export interface T212TransactionsResponse extends T212PeriodEcho {
  accountCurrency: string;
  totals: { deposits: number; withdrawals: number; fees: number; interest: number };
  items: T212Transaction[];
  asOf: string;
  stale: boolean;
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
  | 'UPSTREAM_UNAVAILABLE'
  | 'T212_INVALID_CREDENTIALS'
  | 'T212_MISSING_PERMISSIONS'
  | 'T212_NOT_CONNECTED'
  | 'T212_RATE_LIMITED'
  | 'T212_NOT_CONFIGURED'
  | 'T212_UNAVAILABLE';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
}
