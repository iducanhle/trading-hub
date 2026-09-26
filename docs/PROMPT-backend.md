# Earnings Tracker — Prompt 1 of 2: Backend (Spring Boot)

You are building the backend of **Earnings Tracker**, a personal web app that tracks stocks (US + Europe), their earnings dates, past earnings results, and price reactions around earnings. It has exactly **2 users** (me and a friend). Work autonomously in this repository, run commands to verify your work, and follow the phases in section 14. A second prompt will later build the Angular frontend against the contract in section 10.

---

## 0. Ground rules (read first)

1. **First action:** save this entire prompt verbatim to `docs/PROMPT-backend.md`.
2. Keep `docs/PROGRESS-backend.md` up to date with these sections: **Done**, **In progress**, **Next**, **Known issues**, **Decisions**. Update it after every completed item so that any other model or session can resume from it.
3. **Git:** initialise the repo if needed. Commit after every completed item using conventional commits. Never commit secrets: `.env`, service-account JSON and keys must be in `.gitignore`. Commit `.env.example` with placeholders only.
4. **Phases:** finish one phase, make sure it builds and its tests pass, commit, update PROGRESS, print a short summary (what was done, what I need to do, open questions), then **STOP and wait for me to reply "continue"**.
5. **Cost discipline:**
   - Don't re-read large files unnecessarily.
   - Keep test fixtures small.
   - Don't generate code you won't use.
   - If the same error persists after **2 fix attempts**, stop and report instead of looping.
6. If something is ambiguous but not blocking, choose the sensible option and log it under **Decisions**. Ask only when truly blocked.
7. **Versions:** use the latest stable **Spring Boot** and the latest **Java LTS**. Check the current versions before scaffolding. Use Maven with the wrapper (`./mvnw`).
8. **Everything must stay free.** These are hard constraints:
   - No Firebase Cloud Functions.
   - No Firebase Cloud Storage (it now requires the paid Blaze plan).
   - No phone auth.
   - No paid APIs.
   - Firestore on the free Spark plan: **max 50,000 reads/day and 20,000 writes/day**. The design must stay far below this.
   - Respect every data provider's free rate limit (section 4).
9. **Monorepo layout:** `/backend` (this prompt), `/frontend` (the next prompt), `/docs` (shared), plus `/deploy` and `/.github/workflows`.

---

## 1. Product overview

| Page (frontend) | What the backend must support |
|---|---|
| Login / Register | Firebase Auth (Google + email/password). The backend verifies ID tokens and enforces an email allowlist. |
| Search | Symbol search across US + EU equities. |
| Stock detail | Header, key stats, performance summary, price chart (5y daily OHLCV + earnings markers), daily/weekly/monthly performance history, upcoming earnings, earnings history (EPS + revenue, estimate vs actual), price reaction around earnings, earnings stats, analyst recommendations, news, peers. |
| Followed | Upcoming earnings of the user's followed stocks, sorted by date. |
| Calendar | Earnings calendar for a date range, all stocks, filterable by market cap, region and followed-only. |
| Settings | Notification settings (stored in Firestore by the frontend). Test-email endpoint. |
| Email | Daily digest at **12:00 Europe/Prague** listing followed stocks that report within the user's configured number of days. |

Follows, notes and settings are written **directly to Firestore by the frontend**. The backend reads them with the Admin SDK.

---

## 2. Architecture

```
Angular (Firebase Hosting) ──HTTPS + Firebase ID token──▶ Caddy (TLS) ──▶ Spring Boot ──▶ Finnhub / Twelve Data / Yahoo / (FMP optional)
        │                                                                     │
        └──────── Firestore (user-owned docs only) ◀──── Admin SDK ────────────┘ (cache + user data)
```

- **Two-level cache:** L1 is in-memory (Caffeine); L2 is Firestore. On a cache miss or stale entry, fetch from the provider, store the result, and return it.
- If a provider fails and cached data exists, return the stale data with `stale: true` instead of an error.
- **Provider abstraction:** a separate interface per capability (`SymbolSearchProvider`, `QuoteProvider`, `ProfileProvider`, `PriceHistoryProvider`, `EarningsProvider`, `EarningsCalendarProvider`, `RecommendationProvider`, `NewsProvider`, `PeersProvider`).
  - Routing is by region, with an ordered fallback chain that can be configured in `application.yml`.
  - Swapping a provider must not touch any domain logic.
- **Symbol mapping:** the canonical symbol is the Yahoo-style ticker (section 10). Each adapter maps canonical ↔ provider format (for example `BRK-B` ↔ `BRK.B`).

---

## 3. Tech stack

| Concern | Choice |
|---|---|
| Framework | Spring Boot (latest stable), Java (latest LTS), Maven wrapper |
| HTTP client | Spring `RestClient` |
| Resilience | Per-provider rate limiter + retry with exponential backoff and jitter (Resilience4j or Bucket4j) |
| Cache | Caffeine (L1) + Firestore via Firebase Admin SDK (L2) |
| Auth | Firebase Admin SDK `verifyIdToken` in a Spring Security filter |
| Scheduling | Spring `@Scheduled` with `zone = "Europe/Prague"` |
| Email | Spring Mail (Gmail SMTP, app password) + Thymeleaf HTML template |
| API docs | springdoc-openapi (Swagger UI at `/swagger-ui.html`), if compatible with the Spring Boot version |
| Health | Spring Boot Actuator (health only) + public `GET /api/health` |
| Tests | JUnit 5, AssertJ, MockWebServer or WireMock for provider adapters |
| Packaging | Docker (multi-stage, **must run on linux/arm64**, the Oracle Ampere VM), `docker-compose.yml` with Caddy |

---

## 4. Data sources (all free)

| Provider | Free limit | Used for | Notes |
|---|---|---|---|
| **Finnhub** (key) | 60 calls/min | US: `/search`, `/stock/profile2` (logo, market cap, industry, website), `/quote`, `/stock/metric?metric=all` (52w high/low, P/E, EPS TTM, avg volume), `/calendar/earnings` (EPS + revenue estimate/actual, `hour` bmo/amc), `/stock/earnings`, `/stock/recommendation`, `/company-news`, `/stock/peers` | Historical candles are **premium on the free tier**, so do not use them. International data is premium. |
| **Twelve Data** (key) | 800 calls/day, 8/min | US daily OHLCV: `/time_series?interval=1day&outputsize=…` | Fetch up to 5 years once, then top up incrementally. Track the daily call count. |
| **Yahoo Finance** (unofficial, no key) | Self-limit to ≤1 req/s | EU everything; US fallback. Search `query2…/v1/finance/search`, chart `query1…/v8/finance/chart/{symbol}?range=5y&interval=1d`, quoteSummary `query2…/v10/finance/quoteSummary/{symbol}` (modules: `price, summaryDetail, defaultKeyStatistics, assetProfile, earnings, earningsHistory, earningsTrend, calendarEvents, recommendationTrend`), peers `query2…/v6/finance/recommendationsbysymbol/{symbol}` | quoteSummary needs a cookie + crumb. The server is in **Frankfurt**, so handle Yahoo's **EU cookie-consent redirect**. Mirror the approach of the maintained `yfinance` library. Use a realistic User-Agent. These endpoints are unofficial and may change, so isolate them in one adapter. |
| **FMP** (optional key) | 250 calls/day | Fallback for historical earnings (report dates + EPS/revenue estimates and actuals) | Enabled only if `FMP_API_KEY` is set. |
| FX | via Yahoo chart (`EURUSD=X`, `GBPUSD=X`, `CHFUSD=X`, `SEKUSD=X`, `NOKUSD=X`, `DKKUSD=X`, `PLNUSD=X`, `CZKUSD=X`) | `marketCapUsd` | Refresh daily. |
| Logos | Finnhub `logo` (US) | — | EU fallback: `https://www.google.com/s2/favicons?domain={website-domain}&sz=128`, otherwise `null` (the frontend renders initials). |

**Supported exchanges.**

| Region | Exchanges |
|---|---|
| US | NYSE, NASDAQ, NYSE American |
| EU | `.DE` Xetra, `.PA` Paris, `.AS` Amsterdam, `.BR` Brussels, `.MI` Milan, `.MC` Madrid, `.L` London, `.SW` SIX, `.ST` Stockholm, `.CO` Copenhagen, `.HE` Helsinki, `.OL` Oslo, `.VI` Vienna, `.PR` Prague, `.WA` Warsaw |

Search returns equities only.

**EU earnings calendar.** There is no free market-wide EU calendar, so build it from:
1. A **seed universe** in `backend/src/main/resources/eu-universe.csv` (symbol, name) containing the current constituents of DAX 40, CAC 40, AEX, FTSE 100, SMI, IBEX 35, FTSE MIB, OMX Stockholm 30 and PX, in Yahoo format. Validate every symbol at startup via Yahoo, log invalid ones, and list them in PROGRESS under Known issues.
2. **Plus** every EU symbol that any user follows or has viewed in the last 30 days.

Next earnings dates come from quoteSummary `calendarEvents`.

**Data availability.** Some fields are unavailable for some stocks. For example, EU revenue estimates for past quarters are often missing. Return `null` for those; never fabricate values.

**Phase 2 probe step.** Before implementing the adapters, verify what each free endpoint really returns:
- Run live probes for Yahoo (no key needed).
- Run live probes for Finnhub and Twelve Data if keys exist in `backend/.env`.
- Write the findings (fields, limits, gaps, how far back history goes) to `docs/DATA-SOURCES.md`.
- Mark anything you could not verify as **UNVERIFIED**.
- Adjust the fallback chains to match what you find.

---

## 5. Domain logic

Put all calculations in pure, well-tested classes with no I/O. Percentages are in percent units (`3.25` = +3.25%).

**Performance summary** (latest value = live quote price if newer than the last daily bar):
- `w1` = vs the close 5 trading days earlier.
- `m1` = vs the last close on or before the same calendar day one month earlier.
- `ytd` = vs the last close of the previous year.
- `y1` = vs the last close on or before the same date one year earlier.

**Performance history:**
- **DAILY:** one row per trading day. `changePercent` = close / previous close − 1. `hasEarnings` is true if the day is an earnings **reaction day** (see below).
- **WEEKLY:** ISO weeks. `close` = last close of the week; the change is vs the previous week's last close.
- **MONTHLY:** calendar months, same logic as weekly.
- The current, unfinished period uses the live quote and `partial: true`.
- Rows are newest first, with cursor pagination via `before`.

**Earnings result:**
- Compare the EPS actual vs the estimate, both rounded to 2 decimals: `BEAT` if higher, `MISS` if lower, `INLINE` if equal.
- If either value is missing, `result = null`.
- Surprise % = (actual − estimate) / |estimate| × 100. It is `null` if the estimate is 0 or missing. The same formula applies to revenue.

**Earnings price reaction.** Window `N = 5` trading days, configurable via `app.earnings.window-days`. Let D be the report date.

| Report time | Pre-close (`P`) | Reaction day (`R`) |
|---|---|---|
| `BMO` or `DMH` | close of the trading day before D | D |
| `AMC` | close of D | the next trading day after D |
| `UNKNOWN` | US: treat as `AMC`; EU: treat as `BMO`. Set `timeAssumed = true` | — |

- `preRunUpPercent` = P / close N trading days before P's day − 1
- `gapPercent` = open(R) / P − 1
- `reactionDayPercent` = close(R) / P − 1
- `driftPercent` = close N trading days after R / close(R) − 1. This is `null` if not enough bars exist yet.

**Earnings stats** (over the most recent up-to-8 quarters that have data):
- `beatRate` = % of quarters with `BEAT` among those with a non-null result.
- `streak` = the consecutive run of the most recent identical results (`BEAT` or `MISS`). `INLINE` breaks the streak.
- `avgAbsReactionPercent` = mean of |`reactionDayPercent`|.
- `quartersAnalyzed` = the number of quarters used.

**Earnings history** returns up to 12 quarters, merged from all providers and deduplicated by (fiscal year, fiscal quarter) or by report date. Prefer sources in this order: Finnhub calendar → FMP → Yahoo. Persist every calendar entry the jobs see into `earnings/{symbol}`, so the history builds up over time.

**Market cap** is stored in the local currency plus `marketCapUsd` using the latest FX rate. **LSE:** convert pence (GBp/GBX) to GBP for prices and EPS.

---

## 6. Caching & Firestore (backend-owned collections)

The Admin SDK bypasses security rules; the frontend is denied access to these collections by the rules in the frontend prompt.

| Collection / doc | Content | Freshness |
|---|---|---|
| `symbols/{symbol}` | profile, key stats, `marketCap`, `marketCapUsd`, `logoUrl`, `website`, `updatedAt` | 7 days (market cap: 1 day for followed symbols) |
| `prices/{symbol}` | `bars: [{d,o,h,l,c,v}]`, up to 5y daily, oldest first; `updatedAt` | Topped up daily after the close; on demand if older than 1 trading day |
| `earnings/{symbol}` | merged quarters, upcoming event, `updatedAt` | 1 day, or on demand |
| `earningsCalendar/{YYYY-MM-DD}` | `events: EarningsEvent[]` for that day (**one doc per day**, to keep reads low) | Daily job |
| `fx/latest` | rates to USD | Daily |
| `jobRuns/{jobName}` | `lastStart`, `lastSuccess`, `lastError`, `stats` | Per run |
| `notificationLog/{uid}_{YYYY-MM-DD}` | idempotency record for the digest email | Per send |
| `viewed/{symbol}` | `lastViewedAt`, used to include recently viewed symbols in jobs | On detail view (write at most once per symbol per day) |

**Rules:**
- Quotes live in **L1 only**, with a 60 s TTL. Never write them to Firestore.
- News, peers and recommendations live in L1 only: news for 30 min, peers and recommendations for 1 day.
- Serve calendar ranges from L1 for 10 min.
- A document must stay well under Firestore's 1 MiB limit.
- Log estimated Firestore reads/writes per job run.

---

## 7. Scheduled jobs (zone `Europe/Prague`)

| Job | When | What |
|---|---|---|
| `calendar-refresh` | daily 06:00 | US: Finnhub `/calendar/earnings` in 7-day chunks from today−14 to today+45. Enrich `marketCapUsd` and logo via profile2, nearest dates first, at most 1,500 profile calls per run, with a 30-day profile cache. EU: refresh followed and recently viewed EU symbols. Write `earningsCalendar/*` and `earnings/*`. |
| `eu-universe-refresh` | Sunday 03:00 | Next earnings dates and market caps for the whole EU seed universe via Yahoo, throttled to ≤1 req/s. |
| `prices-refresh` | daily 23:30 | Incremental daily bars for followed and recently viewed symbols. Fill in actuals for reports from the last 7 days. |
| `earnings-digest` | daily **12:00** | The email digest (section 8). |

- All jobs are idempotent and resumable, with a lock to prevent overlapping runs. Their status is recorded in `jobRuns`.
- Each can be triggered manually via the admin endpoint.
- Run `calendar-refresh` once on startup if its last success is older than 24 h.

---

## 8. Email digest

- **Recipients:** users with `settings.notificationsEnabled == true`. The address is `settings.notificationEmail` if set, otherwise the auth email.
- **Content:** that user's followed stocks with an earnings date in `[today+1, today+notifyDaysBefore]`. The default is `notifyDaysBefore = 1`; allowed values are 1–7.
- **Send only if there is at least one event.** Idempotency comes from `notificationLog`.
- **Subject example:** `Earnings tomorrow: NVDA, SAP.DE`. If the range covers more than one day, use `Upcoming earnings: …`.
- **Body:** a mobile-friendly HTML template with a light, clean design. For each stock: logo, name, symbol, date, report time (Before open / After close / Time TBD), EPS estimate, revenue estimate, and a link to `{APP_BASE_URL}/stock/{symbol}`. Include a plain-text alternative.
- **SMTP:** Gmail `smtp.gmail.com:587` with STARTTLS, using an app password from env vars.
- `POST /api/notifications/test` sends a sample digest to the caller, using their real followed stocks, or sample data if they have none.

---

## 9. Security

- A Spring Security filter verifies `Authorization: Bearer <Firebase ID token>` with the Admin SDK.
- **Allowlist:** `ALLOWED_EMAILS` (comma-separated). The email claim must be on the allowlist **and** `email_verified == true`. Otherwise respond `403 NOT_ALLOWED`.
- **CORS:** allow only `CORS_ALLOWED_ORIGINS`: the Firebase Hosting domains plus `http://localhost:4200`.
- `GET /api/health` is the only public endpoint. Swagger UI may be public, but every API call from it still needs a token.
- Validate inputs: symbol format, dates, ranges (calendar max 42 days), limits.
- Use a global exception handler that produces the error format in section 10.
- Never log tokens or keys.

---

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
| 429 | `RATE_LIMITED` |
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

## 11. Configuration

`backend/.env.example` (placeholders only):
```
FINNHUB_API_KEY=
TWELVEDATA_API_KEY=
FMP_API_KEY=                      # optional
FIREBASE_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-sa.json
ALLOWED_EMAILS=me@example.com,friend@example.com
CORS_ALLOWED_ORIGINS=https://YOUR_PROJECT.web.app,https://YOUR_PROJECT.firebaseapp.com,http://localhost:4200
MAIL_USERNAME=you@gmail.com
MAIL_APP_PASSWORD=
MAIL_FROM_NAME=Earnings Tracker
APP_BASE_URL=https://YOUR_PROJECT.web.app
DOMAIN=yoursubdomain.duckdns.org
DUCKDNS_SUBDOMAIN=yoursubdomain
DUCKDNS_TOKEN=
TZ=Europe/Prague
```

- Use profiles `local` and `prod`.
- **Local profile:** runs with `./mvnw spring-boot:run`, reading `.env` via spring-dotenv or an equivalent, or documented env export.
- If provider keys are missing, the app still starts, logs a clear warning, and falls back to Yahoo where possible.

---

## 12. Testing

- **Unit tests:** every calculator in section 5 (performance, history aggregation including partial periods, result/surprise, reaction for BMO/AMC/UNKNOWN, stats/streak, pence conversion, FX conversion).
- **Adapter tests:** use small recorded JSON fixtures served by MockWebServer or WireMock.
- **Security tests:** missing token → 401, email not on the allowlist or unverified → 403.
- **Smoke test script** `backend/scripts/smoke.sh`: calls `/api/health` and, given a token, the main endpoints for `AAPL` and `SAP.DE`.

---

## 13. Deployment (write `docs/DEPLOYMENT-backend.md`)

Assume I have **never deployed anything**. Give click-by-click steps with the exact commands, what I should see after each step, and troubleshooting. Cover:

1. **Firebase project** (shared with the frontend):
   - Create the project.
   - Create the Firestore database (location `eur3` or `europe-west3`).
   - Enable the Auth providers **Google** and **Email/Password**.
   - Generate a **service-account JSON key** and explain where it goes and why it must never be committed.
   - Stay on the free **Spark** plan.
2. **API keys:** Finnhub and Twelve Data (FMP optional). Where to sign up and where each key goes.
3. **Gmail app password:** enable 2-Step Verification, create the app password, put it in `.env`.
4. **Oracle Cloud:**
   - Create the account with **home region Frankfurt**, and explain it cannot be changed.
   - **Upgrade to Pay As You Go.** Idle Always Free instances (<20% CPU at the 95th percentile over 7 days) get reclaimed, and PAYG prevents that while Always Free resources stay $0.
   - Create a **budget alert at $1**.
   - Create an **Ampere A1 Flex VM (2 OCPU / 12 GB, Ubuntu 24.04 aarch64)**, within the Always Free limits.
   - Set up SSH keys.
   - Open ports 80/443 in the **Security List** *and* in the Ubuntu **iptables** rules, persisted.
   - Handle "Out of host capacity" by trying another availability domain or retrying later.
5. **DuckDNS:** create the subdomain, point it at the VM's public IP, and run an updater container or cron.
6. **Server setup:**
   - Install Docker + the compose plugin.
   - Create `/opt/earnings-tracker` with `.env` and the service-account JSON (`chmod 600`).
   - Start `docker-compose.yml` (app + Caddy, with automatic HTTPS for `DOMAIN`).
   - Verify with `curl https://DOMAIN/api/health`.
7. **CI/CD** (`.github/workflows/backend.yml`, triggered on pushes to `main` that touch `backend/**`):
   - Build and test with Maven on the runner.
   - Build a **linux/arm64** image (buildx; copy the prebuilt jar to keep QEMU work minimal).
   - Push to GHCR.
   - SSH to the VM and run `docker compose pull && docker compose up -d`.
   - List the required GitHub secrets and how to create each one.
8. **Verification checklist:** health, `/api/me` with a real token, search, a stock detail, calendar, the test email, the manual job trigger.
9. **Operations:** view logs, restart, update `.env`, rotate keys, check `jobRuns`, and how to confirm the monthly cost is **$0** (Oracle billing page, Firebase usage page).

Also provide `backend/README.md` with local development instructions.

---

## 14. Phases (stop after each one)

| Phase | Scope | Done when |
|---|---|---|
| **0 – Setup** | Save the prompt, create the monorepo skeleton, `docs/CONTRACT.md`, `docs/PROGRESS-backend.md`, `.gitignore`, root `README.md` | Committed |
| **1 – Skeleton** | Spring Boot app, config and profiles, Firebase Admin init, security filter + allowlist + CORS, error handler, `/api/health`, `/api/me`, Dockerfile (arm64-compatible), `docker-compose.yml` + `Caddyfile`, security tests | `./mvnw verify` passes; `docker build` works |
| **2 – Providers** | Probe step → `docs/DATA-SOURCES.md`, then the Finnhub, Twelve Data, Yahoo (cookie/crumb + EU consent) and optional FMP adapters, symbol mapping, rate limiters, retries, the L1/L2 cache layer, FX, and EU universe CSV validation | Adapter tests pass; probe results documented |
| **3 – Domain + REST** | All calculators (section 5) with unit tests, then every endpoint in the contract | All tests pass; the smoke script works locally |
| **4 – Jobs + email** | The 4 scheduled jobs, locks, `jobRuns`, admin trigger, digest email template, test-email endpoint | A job run can be triggered manually; the test email arrives |
| **5 – Deployment** | Final `docker-compose.yml`, DuckDNS updater, GitHub Actions workflow, `docs/DEPLOYMENT-backend.md`, `backend/README.md` | Docs complete; workflow lint passes |

## Definition of done
- Every endpoint in `docs/CONTRACT.md` is implemented exactly as specified.
- All tests pass and the Docker image builds for arm64.
- There are no secrets in git.
- The PROGRESS file is complete, and Known issues honestly lists data gaps (for example, EU revenue estimates).
- A person who has never deployed anything can follow `docs/DEPLOYMENT-backend.md` end to end.
