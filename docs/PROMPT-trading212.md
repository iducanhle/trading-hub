# Earnings Tracker — Feature prompt: Trading 212 portfolio tab

You are adding a **Trading 212** feature to Earnings Tracker, an existing personal, mobile-first PWA (Angular 22 frontend in `/frontend`, Spring Boot backend in `/backend`, two allowlisted users). Each user connects their own Trading 212 account with an API key, then browses their trades, filters them, and sees how much they have made or lost on each stock and overall, for any time range or all time. Work autonomously, verify with builds and tests, and follow the phases in section 9.

---

## 0. Ground rules

1. **First action:** save this prompt verbatim to `docs/PROMPT-trading212.md` (if it is not already there).
2. **Then read:** `docs/CONTRACT.md`, `docs/PROGRESS-backend.md`, `docs/PROGRESS-frontend.md`, `docs/DATA-SOURCES.md`, `docs/DEPLOYMENT-backend.md`, and look at how the `market-events` feature was built end to end (provider → service → controller → contract → frontend feature folder → mocks → i18n). Follow the same patterns.
3. **Read the official API docs before writing the client:** <https://docs.trading212.com/api>. Record what each endpoint really returns (field names, units, currencies, pagination, rate-limit headers, edge cases) in a new section of `docs/DATA-SOURCES.md`. If the docs and this prompt disagree, the docs win; note the difference under **Decisions**.
4. Update `docs/CONTRACT.md` (types, endpoints, changelog) in the same commit as the code that changes the API. Keep both PROGRESS files up to date (Done / In progress / Next / Known issues / Decisions).
5. Commit after every completed item (conventional commits). **Never commit secrets** — no real API keys in code, fixtures, tests or logs.
6. Finish one phase, make sure backend tests, `ng build` and frontend tests pass, commit, print a short summary (done, what I need to do, open questions), then **STOP and wait for "continue"**.
7. Everything stays free: Firebase Spark, no Cloud Functions, no paid libraries. Keep Firestore reads low (50k/day free).
8. If the same error survives 2 fix attempts, stop and report.

---

## 1. What we know about the Trading 212 Public API

Verify all of this against the docs (rule 0.3).

- **Base URLs:** live `https://live.trading212.com/api/v0`, demo (paper trading) `https://demo.trading212.com/api/v0`.
- **Auth:** HTTP Basic — `Authorization: Basic base64(API_KEY:API_SECRET)`. The user generates the key + secret in the Trading 212 app (Settings → API). Older keys may be a single key sent as the raw `Authorization` header; support that only if the docs still describe it.
- **Only Invest and Stocks ISA** accounts are supported (no CFD). Multi-currency is not supported: values come in the account's **primary currency**.
- **Endpoints we need (read-only):**
  - `GET /equity/account/summary` — cash, invested, total value, currency.
  - `GET /equity/positions` — open positions (quantity, average price, current price, P/L).
  - `GET /equity/history/orders` — historical orders/fills (paginated).
  - `GET /equity/history/dividends` — dividends (paginated).
  - `GET /equity/history/transactions` — deposits, withdrawals, fees, interest (paginated).
  - `GET /equity/metadata/instruments` — instrument metadata (T212 ticker such as `AAPL_US_EQ`, ISIN, currency, name).
- **Pagination:** `limit` (max 50) + `cursor`; follow `nextPagePath` until it is `null`.
- **Rate limits** are per account (not per key or IP) and strict on history endpoints. Read the `x-ratelimit-*` headers (`limit`, `period`, `remaining`, `reset`, `used`) and wait instead of failing.
- **Never call** any order-placing or order-cancelling endpoint. The client must not even contain those methods.

---

## 2. Architecture decisions (already made)

1. **The browser never talks to Trading 212.** The backend proxies everything. Reasons: the API secret must not live in the browser, T212 does not serve CORS for web apps, and the per-account rate limit needs one place that controls it.
2. **Credentials are stored by the backend, encrypted.**
   - The frontend sends the key + secret once: `PUT /api/t212/credentials`. The backend validates them by calling `/equity/account/summary`, then stores them.
   - Storage: Firestore collection `t212Credentials/{uid}` written **only by the Admin SDK**. Add an explicit deny for this path in `firestore.rules` and a rules test proving a signed-in owner can neither read nor write it.
   - Encrypt key and secret with **AES-256-GCM** (random IV per value) using a master key from a new env var `T212_ENCRYPTION_KEY` (base64, 32 bytes). Document how to generate it and where to put it in `docs/DEPLOYMENT-backend.md`: the VM's `/opt/earnings-tracker/.env` (Compose already loads it via `env_file`, so `docker-compose.yml` needs no change) and `backend/.env.example` (empty placeholder). Warn that losing or changing it makes stored credentials unreadable, so users must reconnect. If the env var is missing, the T212 endpoints return 503 `T212_NOT_CONFIGURED` and the rest of the app works normally.
   - The API **never returns** the key or secret. Status responses return only a hint (last 4 characters of the key), the environment, and timestamps.
   - Never log keys, secrets, or the `Authorization` header. Add a test that the HTTP client's logging redacts it.
3. **History is synced and stored by the backend, the frontend reads computed results.**
   - Sync = fetch all pages of orders, dividends and transactions; first sync is full, later syncs are incremental (stop paging when reaching an item already stored).
   - Store normalized items per user in backend-owned Firestore collections (e.g. `t212/{uid}/orders/{id}`, `.../dividends/{id}`, `.../transactions/{id}`, plus `t212/{uid}` with sync state). Deny client access in the rules. Keep an in-memory per-user cache so the backend does not re-read all documents on every request.
   - Sync triggers: when credentials are saved, manually (`POST /api/t212/sync`), and a scheduled job (e.g. every 6 hours, reuse `JobScheduler`). Positions and account summary are fetched live with a short cache (~60 s) since they change with prices.
   - Only one sync per user at a time; a second request returns the running sync's status.
4. **P/L is computed with the average-cost method** (the method Trading 212 shows). Prefer fields T212 already provides (e.g. realized result or wallet impact on a fill, fees, taxes, FX rate); compute only what is missing, and document which in `DATA-SOURCES.md`. All money is in the account currency.
5. **Symbol mapping:** map T212 tickers to the app's canonical Yahoo-style `symbol` (`AAPL_US_EQ` → `AAPL`, `SAPd_EQ` → `SAP.DE`, LSE pence etc.) using instrument metadata (ISIN, currency, exchange suffix). Unmapped instruments still work, they just have `symbol: null` and no link to the stock detail page. Cover the mapping with unit tests.

---

## 3. Definitions (use the same ones everywhere and in the ⓘ term hints)

Per instrument:
- **Bought / Sold** — total quantity and total value of filled buys and sells.
- **Average cost** — average-cost basis of the shares currently held.
- **Realized P/L** — sum of (sell price − average cost at the time) × quantity over all sells, minus fees and taxes on those trades.
- **Unrealized P/L** — (current price − average cost) × held quantity. Only for open positions.
- **Dividends** — net dividends received.
- **Total P/L** = realized + unrealized + dividends − other fees. Also as a percentage of total money invested in that instrument.
- **Status:** `OPEN` (shares held), `CLOSED` (fully sold).

For a **time range** (1M, 3M, YTD, 1Y, custom, All):
- The list of trades, dividends and transactions is filtered to the range.
- **Realized P/L in range** = realized P/L of sells executed in the range (cost basis still comes from all earlier buys).
- **Dividends in range**, **fees in range**, **deposits/withdrawals in range**.
- Unrealized P/L is always "as of now" and is shown only for All, labeled as such. Do **not** try to compute historical portfolio value for a range — no daily price history of the portfolio is available. Log this under **Decisions**.

---

## 4. API (add to `docs/CONTRACT.md`)

All endpoints require the Firebase ID token and act on the caller's own data only. Suggested shape — refine and document:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/t212/status` | `{ connected, environment: "LIVE" \| "DEMO" \| null, keyHint, accountCurrency, lastSyncAt, syncState: "IDLE" \| "RUNNING" \| "FAILED", lastError }` |
| `PUT` | `/api/t212/credentials` | Body `{ apiKey, apiSecret, environment }`. Validates, encrypts, stores, starts the first sync. Returns status. |
| `DELETE` | `/api/t212/credentials` | Removes credentials **and** all synced data for the user. |
| `POST` | `/api/t212/sync` | Starts an incremental sync (202 + status). |
| `GET` | `/api/t212/summary?from=&to=` | Account totals: value, cash, invested, realized/unrealized/total P/L, dividends, fees, deposits, withdrawals, best and worst instrument. |
| `GET` | `/api/t212/instruments?from=&to=&status=OPEN\|CLOSED\|ALL` | Per-instrument rows: t212Ticker, symbol, name, logoUrl, currency, status, quantity, averageCost, currentPrice, bought, sold, realizedPnl, unrealizedPnl, dividends, totalPnl, totalPnlPct, firstTradeAt, lastTradeAt. |
| `GET` | `/api/t212/instruments/{t212Ticker}` | One instrument: the row above + all its trades and dividends. |
| `GET` | `/api/t212/trades?from=&to=&side=BUY\|SELL&ticker=&cursor=&limit=` | Filled trades, newest first: id, executedAt, t212Ticker, symbol, name, side, quantity, price, value, fees, taxes, fxRate, realizedPnl (sells). |
| `GET` | `/api/t212/dividends?from=&to=&ticker=` | Dividends. |
| `GET` | `/api/t212/transactions?from=&to=&type=` | Deposits, withdrawals, fees, interest. |

New error codes: `T212_NOT_CONNECTED` (409), `T212_INVALID_CREDENTIALS` (400 on save; on later 401/403 from T212 mark credentials invalid and surface it in status), `T212_RATE_LIMITED` (429), `T212_NOT_CONFIGURED` (503), `T212_UNAVAILABLE` (503). Responses carry `asOf` and `stale` like the rest of the API.

---

## 5. Frontend

### Navigation
- New lazy route `/portfolio` with a tab **"Portfolio"** (icon e.g. `wallet` / `account_balance_wallet`; add it to `icon-paths.ts` and the icon generator). The bottom bar now has 6 tabs — check it at 360 px and 390 px; if labels do not fit, shorten labels or show labels only for the active tab. Note the decision.
- When not connected, the tab shows an empty state explaining the feature with a button "Connect Trading 212" leading to Settings.

### Settings → "Trading 212" section
- Not connected: a short guide (where to generate the key in the T212 app, **recommend read-only permissions and IP restriction to the server's IP**, shown from config), fields API key + API secret (password inputs with show/hide), environment toggle Live / Demo, "Connect" button. Errors inline.
- Connected: environment, `•••• 1234` key hint, account currency, last sync time and state, buttons "Sync now", "Replace key", "Disconnect" (confirmation dialog explaining that synced data is deleted).
- The key is never stored in Firestore user settings, localStorage or anywhere in the browser; the input is cleared after submit.

### Portfolio page (sub-tabs or segmented control)
1. **Overview** — period selector (1M · 3M · YTD · 1Y · All · Custom) shared by all sub-tabs and kept in the URL query; KPI tiles (total value, total P/L with %, realized, unrealized (All only), dividends, fees, net deposits); best/worst instruments; sync state + pull-to-refresh triggers sync.
2. **Stocks** — per-instrument list: logo, name, status chip (Open/Closed), total P/L with sign and color, %. Filter Open / Closed / All, search by name/ticker, sort by P/L, P/L %, value, last trade, name.
3. **Trades** — infinite list grouped by day: Buy/Sell badge, name, quantity × price, value, realized P/L on sells. Filters (bottom sheet on mobile, like the events filter): side, instrument (autocomplete), period. Active filters as removable chips.
4. **Dividends & cash** — dividends list with total for the period; deposits/withdrawals/fees/interest list.

### Instrument detail (`/portfolio/:t212Ticker`)
- Header with status, held quantity, average cost, current price, total / realized / unrealized P/L, dividends, first and last trade.
- Timeline of all trades and dividends for this instrument with the running position size.
- Link "Open stock detail" when `symbol` is mapped.

### Integration with existing pages
- On the existing stock detail page, if the user holds or held the stock, show a compact **"Your position"** card (quantity, average cost, total P/L) linking to the instrument detail.
- If feasible, add buy/sell markers to the existing Lightweight Charts price chart on the stock detail page (toggle). Optional — do it last.

### General
- Follow existing patterns: signals, `httpResource`, skeleton loading, inline error with Retry, empty states, `stale` chip, shared number/percent formatting (sign always shown), `—` for null.
- **i18n:** every new string in English + Czech (`messages.cs.json`). Add ⓘ term hints for average cost, realized P/L, unrealized P/L, total P/L.
- **Mock mode:** add fixtures under `frontend/src/assets/mocks/` and handlers in `mock-backend.ts` (connected and not-connected states, a closed position with profit, an open position at a loss, dividends, a mapped and an unmapped instrument).

---

## 6. Backend

- New package `com.earningstracker.provider.t212`: `T212Client` (read-only, Basic auth, live/demo base URL, pagination via `nextPagePath`, rate-limit aware: honor `x-ratelimit-remaining/reset`, back off and retry on 429), DTOs matching the real responses, and a symbol mapper.
- `com.earningstracker.t212` (or `service`): `T212CredentialStore` (encrypt/decrypt, Firestore), `T212SyncService` (full/incremental sync, one at a time per user, state in Firestore), `T212PortfolioService` (average-cost engine, period filtering, aggregates), `T212SyncJob` registered in `JobScheduler`.
- `T212Controller` under `/api/t212/**`, user resolved from `AuthenticatedUser`.
- Config in `application.yml`: `t212.encryption-key`, `t212.sync-interval`, `t212.server-ip-hint`, timeouts. Document in `backend/README.md`.
- **Tests** (fixtures under `src/test/resources/fixtures/t212/`, no real keys):
  - Average-cost engine: partial sells, full close then re-buy, fractional shares, fees and taxes, stock splits if the API represents them, dividends.
  - Period filtering (realized P/L in range uses the full cost history).
  - Pagination and incremental sync stop condition; rate-limit back-off.
  - Encryption round-trip, wrong master key fails cleanly, keys never appear in logs or responses.
  - Controller: auth required, users cannot see each other's data, error codes.

---

## 7. Security checklist

- [ ] Key + secret encrypted at rest, master key only in the VM secrets folder.
- [ ] Firestore rules deny client access to `t212Credentials/**` and `t212/**`; rules tests cover it.
- [ ] No endpoint returns the key or secret; no log line contains them or the `Authorization` header.
- [ ] Client code contains no order-placing/cancelling calls.
- [ ] Disconnect deletes credentials and all synced data.
- [ ] Settings UI recommends read-only key permissions and IP restriction to the VM.

---

## 8. Out of scope

Placing or cancelling orders, CFD accounts, tax reports, historical portfolio value charts, notifications about trades, CSV import (could be a later fallback if the API history is incomplete — note it if you discover gaps).

---

## 9. Phases

1. **Research & contract** — read the T212 docs, update `DATA-SOURCES.md` and `CONTRACT.md`, decide the storage layout; no code yet. STOP.
2. **Backend: credentials** — encryption, credential store, status/connect/disconnect endpoints, rules + rules tests, deployment docs for `T212_ENCRYPTION_KEY`. STOP.
3. **Backend: sync** — client with pagination and rate limits, symbol mapping, full + incremental sync, scheduled job. STOP.
4. **Backend: P/L engine & read endpoints** — summary, instruments, instrument detail, trades, dividends, transactions, with tests. STOP.
5. **Frontend: Settings + mocks** — Trading 212 section in Settings, contract types, API service, mock handlers and fixtures. STOP.
6. **Frontend: Portfolio tab** — navigation, Overview, Stocks, Trades, Dividends & cash, instrument detail, filters, period selector, i18n, term hints. STOP.
7. **Integration & polish** — "Your position" card on stock detail, optional chart markers, end-to-end check against a **demo** account, PROGRESS and README updates.
