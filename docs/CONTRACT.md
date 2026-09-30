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
| `GET /api/stocks/{symbol}/prices?range=1W\|1M\|6M\|1Y\|5Y` | `{ symbol, currency, range, bars: PriceBar[] /* oldest first */, baseClose: number \| null /* last close before the range */, earningsMarkers: EarningsMarker[], asOf, stale }` | Daily bars; markers include upcoming events within the range |
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
    notificationEmail: string | null,             // null = use auth email
    language?: "en" | "cs" | null                 // optional; null/missing = not chosen (device language)
  }
users/{uid}/follows/{symbol}   { symbol, name, exchange, region, logoUrl, followedAt: timestamp }
users/{uid}/notes/{symbol}     { symbol, text, updatedAt: timestamp }
```
Backend-only collections (all client access is denied by the rules): `symbols`, `prices`, `earnings`, `earningsCalendar`, `fx`, `jobRuns`, `notificationLog`, `viewed`.

---

## Implementation notes

Behaviour the tables above leave open, as the backend implements it. No field names or types differ from v1.

- **Symbols in paths** are case-insensitive (`sap.de` → `SAP.DE`). An unsupported format or exchange suffix returns 400.
- **`GET /api/search`**: `q` is 1–64 characters after trimming. US and EU results are interleaved, with exact symbol matches first (`sap` → `SAP.DE`, `SAP`, …). `logoUrl` is filled only for stocks whose profile is already cached.
- **`GET /api/stocks/{symbol}/prices`**:
  - `range` defaults to `1Y`, counted back from the latest bar. Only completed sessions are returned.
  - `earningsMarkers` holds the reported quarters whose reaction day falls within the range, plus the next upcoming report. That marker has `result: "UPCOMING"` and a `date` equal to its expected reaction day under the timing rule, with weekends skipped.
- **`GET /api/stocks/{symbol}/history`**:
  - `period` defaults to `DAILY` and `limit` to 30 (1–100).
  - `before` is exclusive: only rows whose `periodStart` is earlier. `nextBefore` is the last row's `periodStart` when more rows exist.
  - `periodStart` and `periodEnd` are the first and last trading days of the period.
  - Weekly and monthly `volume` is the sum of daily volumes. A partial day uses the live quote's volume when the source has one, otherwise 0.
- **`GET /api/stocks/{symbol}/earnings`**:
  - `quarters` holds reported quarters only. A report counts as reported after its date, or on its date once the actual is known.
  - `upcoming` is the next unreported report.
  - `time` is what the source reported (`UNKNOWN` when not known). `timeAssumed: true` means the reaction was computed with the UNKNOWN rule.
- **`GET /api/stocks/{symbol}/news`**: `limit` is 1–50, default 10.
- **`GET /api/calendar`**: `from` and `to` are required and inclusive, at most 42 days (`to − from + 1 ≤ 42`). Events come from the daily calendar job, so a date it has not covered yet is empty.
- **`GET /api/followed/earnings`** uses stored data only. A followed stock whose earnings have never been loaded is listed in `noUpcomingDate` and loaded in the background, so it normally appears on the next request.
- **`asOf` / `stale` on combined responses** (overview, prices, earnings): `asOf` is the oldest fetch time among the data used. `stale` is true if any of it was served from cache after a provider failure.
- **`POST /api/notifications/test`** (no request body) sends the email before answering:
  - It goes to `settings.notificationEmail` if set, otherwise the account email. `sentTo` is that address.
  - It lists the caller's followed stocks with an earnings date in the next 7 days, or sample data (marked as such) if there are none. The subject starts with `[Test]`.
  - One per minute per user; a second call within the minute returns 429 `RATE_LIMITED`.
  - 503 `UPSTREAM_UNAVAILABLE` when the server has no mail settings or the mail server refuses the message.
- **`POST /api/admin/jobs/{jobName}/run`** (no request body) is open to every allowed user:
  - It starts the job in the background and answers at once. `startedAt` is an ISO-8601 UTC timestamp.
  - If that job is already running, the response carries the running job's `startedAt` and no second run starts.
  - An unknown `jobName` returns 400. The outcome is recorded in the backend-only `jobRuns/{jobName}` document (Firebase console).

---

## Changelog

| Date | Change |
|---|---|
| 2026-09-26 | v1: initial contract, verbatim from the prompt. |
| 2026-09-27 | Errors: added `404 NOT_FOUND` (unknown endpoint), `405 METHOD_NOT_ALLOWED` and `500 INTERNAL_ERROR`, so every error response has a documented code. |
| 2026-09-27 | Added "Implementation notes": defaults, limits, cursor paging, marker and quarter semantics, the inclusive 42-day calendar span. No field changes. |
| 2026-09-27 | Implementation notes for `POST /api/notifications/test` (recipient, 7-day window, sample data, 429, 503) and `POST /api/admin/jobs/{jobName}/run` (background start, already-running behaviour, 400). No field changes. |
