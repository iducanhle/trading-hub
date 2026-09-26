# Earnings Tracker — API Contract

> Single source of truth between `backend/` and `frontend/`. Initially copied verbatim from §10 of [PROMPT-backend.md](PROMPT-backend.md). Any API change is made here in the same commit as the code, recorded in the changelog at the bottom, and noted in [PROGRESS-backend.md](PROGRESS-backend.md).

## 10. Shared contract (v1)

Write this section verbatim to **`docs/CONTRACT.md`**. It is the single source of truth for the frontend. If you change the API during implementation, update `docs/CONTRACT.md` in the same commit and note the change in PROGRESS.

### Conventions
- Base path `/api`. JSON uses camelCase. Every endpoint except `GET /api/health` requires `Authorization: Bearer <Firebase ID token>`.
- **`symbol`** is the canonical Yahoo-style ticker, uppercase:
  - US: `AAPL`, `BRK-B`
  - Europe: `SAP.DE`, `ASML.AS`, `MC.PA`, `AZN.L`, `NESN.SW`, `CEZ.PR`
  - URL-encode it in paths.
- **`region`**: `"US" | "EU"`. EU means any supported European exchange, including UK, CH and the Nordics.
- **Dates:** `YYYY-MM-DD` is the trading date in the exchange's local time. **Timestamps:** ISO-8601 UTC.
- **Money:** prices, EPS and revenue are in the stock's `currency` (ISO 4217); LSE pence are normalized to GBP. `marketCapUsd` is converted to USD.
- **Percentages:** `3.25` means +3.25%.
- **`ReportTime`**: `"BMO"` (before open), `"AMC"` (after close), `"DMH"` (during market hours), or `"UNKNOWN"`.
- **`EarningsResult`**: `"BEAT" | "MISS" | "INLINE"`.
- **Nulls:** any field may be `null` when no source has it. The UI renders `—`.
- **`asOf`** is when the data was fetched. **`stale: true`** means the upstream failed and cached data is being served.

### Errors
The HTTP status plus the body `{ "code": string, "message": string }`.

| Status | `code` |
|---|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `NOT_ALLOWED` (email not on the allowlist or not verified) |
| 404 | `SYMBOL_NOT_FOUND` |
| 404 | `NOT_FOUND` (unknown endpoint) |
| 405 | `METHOD_NOT_ALLOWED` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (unexpected server error) |
| 503 | `UPSTREAM_UNAVAILABLE` (no cached data available) |

### Types
```ts
type Region = "US" | "EU";
type ReportTime = "BMO" | "AMC" | "DMH" | "UNKNOWN";
type EarningsResult = "BEAT" | "MISS" | "INLINE";

type SearchResult = {
  symbol: string; name: string; exchange: string; region: Region;
  currency: string; logoUrl: string | null;
};

type EarningsEvent = {
  symbol: string; name: string; exchange: string; region: Region; logoUrl: string | null;
  date: string; time: ReportTime;
  fiscalQuarter: number | null; fiscalYear: number | null;
  currency: string | null;
  epsEstimate: number | null; epsActual: number | null;
  revenueEstimate: number | null; revenueActual: number | null;
  marketCapUsd: number | null;
};

type EarningsStats = {
  quartersAnalyzed: number;
  beatRate: number | null;                       // percent
  streak: { result: "BEAT" | "MISS"; count: number } | null;
  avgAbsReactionPercent: number | null;
};

type StockOverview = {
  symbol: string; name: string; exchange: string; region: Region; currency: string;
  logoUrl: string | null; sector: string | null; industry: string | null; website: string | null;
  quote: { price: number; change: number; changePercent: number; previousClose: number; asOf: string };
  keyStats: {
    marketCap: number | null; marketCapUsd: number | null;
    week52High: number | null; week52Low: number | null;
    peRatio: number | null; epsTtm: number | null; avgVolume: number | null;
  };
  performance: { w1: number | null; m1: number | null; ytd: number | null; y1: number | null };
  nextEarnings: EarningsEvent | null;
  earningsStats: EarningsStats;
  asOf: string; stale: boolean;
};

type PriceBar = { date: string; open: number; high: number; low: number; close: number; volume: number };
type EarningsMarker = {
  date: string;                // reaction day (the bar where the move shows)
  reportDate: string; time: ReportTime;
  result: EarningsResult | "UPCOMING" | null;
  epsSurprisePercent: number | null;
};

type HistoryRow = {
  periodStart: string; periodEnd: string;
  close: number; changePercent: number | null; volume: number;
  hasEarnings: boolean; partial: boolean;
};

type EarningsReaction = {
  preRunUpPercent: number | null; gapPercent: number | null;
  reactionDayPercent: number | null; driftPercent: number | null;
};

type EarningsQuarter = {
  date: string; time: ReportTime; timeAssumed: boolean;
  fiscalQuarter: number | null; fiscalYear: number | null; currency: string | null;
  eps: { estimate: number | null; actual: number | null; surprisePercent: number | null };
  revenue: { estimate: number | null; actual: number | null; surprisePercent: number | null };
  result: EarningsResult | null;
  reaction: EarningsReaction | null;
};

type RecommendationPeriod = { period: string /* YYYY-MM */; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
type NewsItem = { headline: string; source: string; url: string; publishedAt: string; imageUrl: string | null; summary: string | null };
```

### Endpoints
| Method & path | Response | Notes |
|---|---|---|
| `GET /api/health` | `{ status: "UP" }` | Public |
| `GET /api/me` | `{ uid, email, allowed: true }` | 403 if not allowed |
| `GET /api/search?q=&limit=10` | `SearchResult[]` | `q` must be ≥1 char; max 20 results; US + EU equities only |
| `GET /api/stocks/{symbol}` | `StockOverview` | Used above the fold |
| `GET /api/stocks/{symbol}/prices?range=1W\|1M\|6M\|1Y\|5Y` | `{ symbol, currency, range, bars: PriceBar[] /* oldest first */, earningsMarkers: EarningsMarker[], asOf, stale }` | Daily bars; markers include upcoming events within the range |
| `GET /api/stocks/{symbol}/history?period=DAILY\|WEEKLY\|MONTHLY&before=YYYY-MM-DD&limit=30` | `{ period, rows: HistoryRow[] /* newest first */, nextBefore: string \| null }` | `limit` max 100 |
| `GET /api/stocks/{symbol}/earnings` | `{ upcoming: EarningsEvent \| null, quarters: EarningsQuarter[] /* newest first, max 12 */, stats: EarningsStats, asOf, stale }` | |
| `GET /api/stocks/{symbol}/recommendations` | `RecommendationPeriod[]` | Newest first, max 6; may be empty |
| `GET /api/stocks/{symbol}/news?limit=10` | `NewsItem[]` | May be empty |
| `GET /api/stocks/{symbol}/peers` | `SearchResult[]` | Max 8; may be empty |
| `GET /api/calendar?from=&to=&minMarketCapUsd=0&region=ALL\|US\|EU&followedOnly=false` | `{ from, to, days: { date: string, events: EarningsEvent[] }[] }` | Every date in the range is present (possibly empty). Events are sorted by `marketCapUsd` desc, nulls last. `minMarketCapUsd > 0` excludes unknown caps. Max span 42 days. |
| `GET /api/followed/earnings` | `{ upcoming: EarningsEvent[] /* date ≥ today, asc */, noUpcomingDate: SearchResult[] }` | Based on the caller's `users/{uid}/follows` |
| `POST /api/notifications/test` | `202 { sentTo: string }` | |
| `POST /api/admin/jobs/{jobName}/run` | `202 { jobName, startedAt }` | `calendar-refresh`, `eu-universe-refresh`, `prices-refresh`, `earnings-digest` |

### Firestore — user-owned documents (written by the frontend)
```
users/{uid}
  email: string, displayName: string | null, createdAt: timestamp,
  settings: {
    theme: "light" | "dark" | "system",          // default "system"
    notificationsEnabled: boolean,                // default true
    notifyDaysBefore: number,                     // 1–7, default 1
    notificationEmail: string | null              // null = use auth email
  }
users/{uid}/follows/{symbol}   { symbol, name, exchange, region, logoUrl, followedAt: timestamp }
users/{uid}/notes/{symbol}     { symbol, text, updatedAt: timestamp }
```
Backend-only collections (all client access is denied by the rules): `symbols`, `prices`, `earnings`, `earningsCalendar`, `fx`, `jobRuns`, `notificationLog`, `viewed`.

---

## Changelog

| Date | Change |
|---|---|
| 2026-09-26 | v1: initial contract, verbatim from the prompt. |
| 2026-09-27 | Errors: added `404 NOT_FOUND` (unknown endpoint), `405 METHOD_NOT_ALLOWED` and `500 INTERNAL_ERROR`, so every error response has a documented code. |
