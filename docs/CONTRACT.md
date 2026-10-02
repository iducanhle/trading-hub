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
| 400 | `T212_INVALID_CREDENTIALS` (Trading 212 rejected the key on save) |
| 400 | `T212_MISSING_PERMISSIONS` (the key lacks a permission the app needs; `message` names it) |
| 409 | `T212_NOT_CONNECTED` (no Trading 212 key saved for the caller) |
| 429 | `T212_RATE_LIMITED` (Trading 212's per-account limit, and nothing cached to serve) |
| 503 | `T212_NOT_CONFIGURED` (the server has no `T212_ENCRYPTION_KEY`; the rest of the API works) |
| 503 | `T212_UNAVAILABLE` (Trading 212 failed or timed out, and nothing cached to serve) |

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

type EventCategory = "CENTRAL_BANK" | "INFLATION" | "JOBS" | "GROWTH" | "TREASURY" | "MARKET_STRUCTURE" | "EARNINGS" | "POLITICS";
type Importance = "LOW" | "MEDIUM" | "HIGH";

type MarketEvent = {
  id: string; date: string /* publisher's local day */;
  startsAt: string | null /* UTC; null when allDay */; allDay: boolean;
  title: string; label: string /* short, for tiles: "CPI", "FOMC" */;
  category: EventCategory; country: "US" | "EU" | "GB" | "JP";
  importance: Importance; note: string | null;
  moveRatio: number | null /* S&P 500 median move on such days ÷ an ordinary day */;
  sourceUrl: string | null;
  symbol: string | null; logoUrl: string | null; reportTime: ReportTime | null; // EARNINGS events only
};

type RecommendationPeriod = { period: string /* YYYY-MM */; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
type NewsItem = { headline: string; source: string; url: string; publishedAt: string; imageUrl: string | null; summary: string | null };

// ---- Trading 212 (per user). Money is in the account currency unless a field says otherwise. ----
type T212Environment = "LIVE" | "DEMO";
type T212SyncState = "IDLE" | "RUNNING" | "FAILED";
type T212Side = "BUY" | "SELL";
type T212PositionStatus = "OPEN" | "CLOSED";
type T212TradeKind = "TRADE" | "STOCK_SPLIT" | "CORPORATE_ACTION";  // CORPORATE_ACTION: any other non-trade fill type
type T212TransactionType = "DEPOSIT" | "WITHDRAW" | "FEE" | "TRANSFER" | "INTEREST_ON_FREE_CASH" | "LENDING_INTEREST";

type T212Status = {
  connected: boolean;
  environment: T212Environment | null;
  keyHint: string | null;              // last 4 characters of the API key; never the key or secret
  accountCurrency: string | null;
  credentialsValid: boolean | null;    // false once Trading 212 rejects the stored key; null when not connected
  connectedAt: string | null;
  syncState: T212SyncState;            // IDLE when not connected
  syncStartedAt: string | null;        // the running or the last sync
  lastSyncAt: string | null;           // last successful sync
  lastError: { code: string; message: string } | null;  // of the last failed sync
  serverIpHint: string | null;         // the server's IP, to restrict the key to; from config
};

type T212InstrumentRef = { t212Ticker: string; symbol: string | null; name: string; logoUrl: string | null; totalPnl: number };

type T212Summary = {
  from: string | null; to: string | null; tz: string;   // the period asked for; both null = all time
  accountCurrency: string;
  // As of now (live, cached ~60 s); null when Trading 212 is unavailable and nothing is cached
  totalValue: number | null; cash: number | null; invested: number | null /* cost basis of holdings */;
  currentValue: number | null /* of holdings */; unrealizedPnl: number | null;
  // In the period
  realizedPnl: number; dividends: number; fees: number /* trade fees + taxes + FEE transactions */;
  interest: number; deposits: number; withdrawals: number; netDeposits: number;
  tradeCount: number;
  totalPnl: number;                    // realized + dividends − fees, plus unrealizedPnl only when includesUnrealized
  includesUnrealized: boolean;         // true only for all time
  totalPnlPct: number | null;          // all time only: totalPnl ÷ total bought value
  best: T212InstrumentRef | null; worst: T212InstrumentRef | null;   // by totalPnl in the period
  syncState: T212SyncState; lastSyncAt: string | null;
  asOf: string; stale: boolean;
};

type T212Instrument = {
  t212Ticker: string;                  // "AAPL_US_EQ"
  symbol: string | null;               // app symbol; null when unmapped (no stock-detail link)
  name: string; isin: string | null; logoUrl: string | null;
  instrumentCurrency: string | null;   // prices below are in this currency (LSE pence normalized to GBP)
  status: T212PositionStatus;
  quantity: number;                    // held now; 0 when CLOSED
  averageCost: number | null;          // instrument currency, OPEN only
  currentPrice: number | null;         // instrument currency, OPEN only
  value: number | null; costBasis: number | null;   // account currency, OPEN only, as of now
  // In the period
  bought: { quantity: number; value: number }; sold: { quantity: number; value: number };
  realizedPnl: number; dividends: number; fees: number;
  unrealizedPnl: number | null;        // OPEN only, as of now
  totalPnl: number;                    // realized + dividends − fees (+ unrealized for all time)
  totalPnlPct: number | null;          // all time only: totalPnl ÷ total bought value
  tradeCount: number;
  // All time
  firstTradeAt: string | null; lastTradeAt: string | null;
};

type T212Trade = {
  id: string; executedAt: string;
  t212Ticker: string; symbol: string | null; name: string;
  side: T212Side; kind: T212TradeKind;
  quantity: number;                    // always positive
  price: number | null; priceCurrency: string | null;   // instrument currency (pence normalized)
  value: number;                       // account currency, always positive
  fees: number; taxes: number;         // account currency
  fxRate: number | null;
  realizedPnl: number | null;          // SELL only, before fees and taxes
  orderType: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT" | null;
};

type T212Dividend = {
  id: string; paidAt: string;
  t212Ticker: string; symbol: string | null; name: string;
  quantity: number;                    // shares the dividend was paid on
  amount: number;                      // net, account currency
  grossPerShare: number | null; grossPerShareCurrency: string | null;
  type: string;                        // Trading 212's dividend type, e.g. "ORDINARY"
};

type T212Transaction = { id: string; at: string; type: T212TransactionType; amount: number /* signed: − = money out */; currency: string };
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
| `GET /api/market-events?from=&to=&minImportance=LOW\|MEDIUM\|HIGH&region=ALL\|US\|EU\|OTHER&includeEarnings=true` | `{ from, to, days: { date: string, events: MarketEvent[] }[] }` | Every date in the range is present (possibly empty). Events with at least `minImportance` (default `LOW`), most important first, then all-day events, then by time. `region` filters by `country` (`OTHER` = not US or EU). `includeEarnings=false` leaves out the mega-cap reports. Max span 42 days. |
| `GET /api/followed/earnings` | `{ upcoming: EarningsEvent[] /* date ≥ today, asc */, noUpcomingDate: SearchResult[] }` | Based on the caller's `users/{uid}/follows` |
| `POST /api/notifications/test` | `202 { sentTo: string }` | |
| `POST /api/admin/jobs/{jobName}/run` | `202 { jobName, startedAt }` | `calendar-refresh`, `market-events-refresh`, `eu-universe-refresh`, `prices-refresh`, `earnings-digest`, `t212-sync` |
| `GET /api/t212/status` | `T212Status` | Works when not connected (`connected: false`) |
| `PUT /api/t212/credentials` | `T212Status` | Body `{ apiKey: string, apiSecret: string \| null, environment: T212Environment }`. Validates with Trading 212, encrypts, stores, starts the first sync (`syncState: "RUNNING"`) |
| `DELETE /api/t212/credentials` | `204` | Deletes the key **and** all synced data. Idempotent |
| `POST /api/t212/sync` | `202 T212Status` | Incremental sync; if one is running, returns its status and starts nothing |
| `GET /api/t212/summary?from=&to=&tz=` | `T212Summary` | |
| `GET /api/t212/instruments?from=&to=&tz=&status=OPEN\|CLOSED\|ALL` | `{ from, to, tz, accountCurrency, items: T212Instrument[], asOf, stale }` | Sorted by `totalPnl` desc |
| `GET /api/t212/instruments/{t212Ticker}` | `{ accountCurrency, instrument: T212Instrument /* all time */, trades: (T212Trade & { positionAfter: number })[], dividends: T212Dividend[], asOf, stale }` | Both lists newest first. 404 `NOT_FOUND` if the caller never held it |
| `GET /api/t212/trades?from=&to=&tz=&side=BUY\|SELL&ticker=&cursor=&limit=50` | `{ items: T212Trade[] /* newest first */, nextCursor: string \| null, accountCurrency, asOf, stale }` | `limit` 1–100; `ticker` is a `t212Ticker` |
| `GET /api/t212/dividends?from=&to=&tz=&ticker=` | `{ from, to, tz, accountCurrency, total: number, items: T212Dividend[] /* newest first */, asOf, stale }` | |
| `GET /api/t212/transactions?from=&to=&tz=&type=` | `{ from, to, tz, accountCurrency, totals: { deposits, withdrawals, fees, interest }, items: T212Transaction[] /* newest first */, asOf, stale }` | `type` is one `T212TransactionType`; totals ignore it |

### Firestore — user-owned documents (written by the frontend)
```
users/{uid}
  email: string, displayName: string | null, createdAt: timestamp,
  settings: {
    theme: "light" | "dark" | "system",          // default "system"
    notificationsEnabled: boolean,                // default true
    notifyDaysBefore: number,                     // 1–7, default 1
    notificationEmail: string | null,             // null = use auth email
    language?: "en" | "cs" | null,                // optional; null/missing = not chosen (device language)
    termHints?: boolean                           // optional; show the ⓘ term explanations, default true
  }
users/{uid}/follows/{symbol}   { symbol, name, exchange, region, logoUrl, followedAt: timestamp }
users/{uid}/notes/{symbol}     { symbol, text, updatedAt: timestamp }
```
Backend-only collections (all client access is denied by the rules): `symbols`, `prices`, `earnings`, `earningsCalendar`, `fx`, `jobRuns`, `notificationLog`, `viewed`, `t212Credentials`, `t212` (with its subcollections).

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
- **`GET /api/market-events`**: `from` and `to` are required and inclusive, at most 42 days. Same range rules as `/api/calendar`.
  - Macro, central-bank and market-structure events come from the daily `market-events-refresh` job (US: the Compass Economic Calendar; ECB, Bank of England, Bank of Japan and US elections: a curated list in the backend). US macro dates reach about 13 months ahead, but the feed confirms release dates only a few months out, so far-future months show mostly FOMC, ECB, BoE, BoJ and market holidays.
  - Reports of companies with a market cap of at least $200B are included from the earnings calendar (`category: "EARNINGS"`, `allDay: true`, `symbol`, `logoUrl`, `reportTime`; `importance` is `HIGH` from $500B, else `MEDIUM`).
  - `date` is the day in the publisher's own time zone (US events: New York); `startsAt` is the exact instant, to be shown in the viewer's time zone. `title`, `label` and `note` are in English.
  - There are no forecast or actual values. `moveRatio` is present for some US events only.
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

### Trading 212 (`/api/t212/**`)

Every endpoint acts on the caller's own account only; there is no way to address another user. The browser never talks to Trading 212. Field-level sources are in [DATA-SOURCES.md](DATA-SOURCES.md#trading-212-public-api-per-user-brokerage-data).

- **Not configured:** without `T212_ENCRYPTION_KEY` on the server, every `/api/t212/**` endpoint (including `status`) returns 503 `T212_NOT_CONFIGURED`. The frontend hides the feature's controls and explains why.
- **Not connected:** `GET /status` answers `connected: false`; every read endpoint and `POST /sync` return 409 `T212_NOT_CONNECTED`.
- **`PUT /credentials`:**
  - `apiKey` is required (1–200 characters after trimming). `apiSecret` is required for current keys; `null` or `""` sends the key alone as the `Authorization` header (Trading 212's legacy keys).
  - The backend checks the key with Trading 212 (account summary, positions, one page each of order, dividend and transaction history). 401 → 400 `T212_INVALID_CREDENTIALS` (nothing stored). 403 on any of them → 400 `T212_MISSING_PERMISSIONS`, `message` lists the missing permissions. Trading 212 down → 503 `T212_UNAVAILABLE`.
  - Replacing a key for the **same** Trading 212 account keeps the synced data; a key for a **different** account (or environment) deletes it and syncs from scratch.
  - Neither the key nor the secret is ever returned or logged; `keyHint` is the last 4 characters of the key.
- **`DELETE /credentials`** stops a running sync, then deletes the stored key and every synced document. 204 even when nothing was stored.
- **Sync:** history (orders, dividends, transactions) is copied from Trading 212 into backend-only storage. The first sync reads everything; later ones stop at the first item already stored. It starts after `PUT /credentials`, on `POST /sync`, and every 6 hours (`t212-sync` job, all connected users). One sync per user at a time. A first sync of a long history can take minutes (Trading 212 allows 20 history pages of 50 per minute); until it finishes, read endpoints answer with what is stored so far and `syncState: "RUNNING"`.
- **Rejected key later:** when Trading 212 answers 401/403 during a sync or a live call, status shows `credentialsValid: false`, `syncState: "FAILED"`, `lastError.code: "T212_INVALID_CREDENTIALS"`; read endpoints keep serving stored history with `stale: true` until the user replaces the key or disconnects.
- **Live values** (summary totals, open positions: quantity, average cost, current price, value, unrealized P/L) are fetched from Trading 212 and cached per user for about 60 s. If that fails, the last cached values are served with `stale: true`; with nothing cached the live fields are `null` (summary) or the endpoint answers 503 `T212_UNAVAILABLE` / 429 `T212_RATE_LIMITED` (instruments).
- **`asOf`** is the oldest of the last successful sync and the live fetch used. **`stale`** as above.
- **Periods:** `from` and `to` are optional `YYYY-MM-DD` days, both inclusive, read in the IANA time zone `tz` (default `UTC`; the frontend sends the device's zone). Missing `from` = since the first item; missing `to` = today. Both missing = all time. `from > to` or an unknown `tz` → 400.
- **P/L definitions** (average-cost method, as Trading 212 shows it):
  - `realizedPnl` = Trading 212's realized result of each sell in the period, **before** fees and taxes; the cost basis comes from all earlier buys, including those before `from`.
  - `fees` = fees and taxes of every trade in the period (buys and sells) plus `FEE` transactions. `dividends` = net dividends paid in the period.
  - `unrealizedPnl` is always **as of now** and only counted in `totalPnl` for all time (`includesUnrealized: true`). There is no historical portfolio value.
  - `totalPnl` = `realizedPnl` + `dividends` − `fees` (+ `unrealizedPnl` for all time). `interest`, deposits and withdrawals are not part of it.
  - `totalPnlPct` (all time only) = `totalPnl` ÷ the total value of all buys × 100.
- **`GET /instruments`:** all time lists every instrument ever traded or held; a period lists the instruments with a trade or dividend in it. `status` (default `ALL`) filters by the current state. `bought`/`sold`/`realizedPnl`/`dividends`/`fees`/`tradeCount` are for the period; quantity, prices, value and unrealized P/L are as of now.
- **`{t212Ticker}` in paths** is case-sensitive (`SAPd_EQ`). `positionAfter` is the number of shares held right after that trade.
- **`GET /trades`:** filled trades only (cancelled and rejected orders are not stored), including corporate-action fills (`kind`). `cursor` is opaque; pass `nextCursor` back with the same filters.
- **`symbol`** is mapped from the Trading 212 ticker and instrument data; `null` when no supported exchange matches. `logoUrl` as for search results (stored profile, else `null`).
- **Firestore** (backend-only, rules deny all client access): `t212Credentials/{uid}` (encrypted key and secret, hint, environment) and `t212/{uid}` (sync state) with subcollections `orders`, `dividends`, `transactions` (items bucketed by month) and `instruments`.

---

## Changelog

| Date | Change |
|---|---|
| 2026-09-26 | v1: initial contract, verbatim from the prompt. |
| 2026-09-27 | Errors: added `404 NOT_FOUND` (unknown endpoint), `405 METHOD_NOT_ALLOWED` and `500 INTERNAL_ERROR`, so every error response has a documented code. |
| 2026-09-27 | Added "Implementation notes": defaults, limits, cursor paging, marker and quarter semantics, the inclusive 42-day calendar span. No field changes. |
| 2026-09-27 | Implementation notes for `POST /api/notifications/test` (recipient, 7-day window, sample data, 429, 503) and `POST /api/admin/jobs/{jobName}/run` (background start, already-running behaviour, 400). No field changes. |
| 2026-10-02 | Added `GET /api/market-events` with `MarketEvent`, `EventCategory` and `Importance` (additive; nothing existing changed), and the `market-events-refresh` job. |
| 2026-10-02 | Trading 212 portfolio (additive): `/api/t212/**` endpoints, the `T212…` types, six `T212_…` error codes, the `t212-sync` job and the backend-only `t212Credentials` / `t212` collections. Differences from the feature prompt: `apiSecret` may be `null` for legacy keys, `T212_MISSING_PERMISSIONS` is new, `DELETE` answers 204, periods take a `tz`, and fees are reported separately from realized P/L (see the P/L definitions). |
