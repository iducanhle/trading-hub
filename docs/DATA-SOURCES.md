# Data sources

What the free data providers really return, from live probes run on **2026-09-27** from a residential IP in Czechia (EU) with the project's own free keys. Anything that could not be checked is marked **UNVERIFIED**. The fallback chains at the end follow from these findings.

## Summary

| Provider | Coverage on the free tier | Used for | Limit |
|---|---|---|---|
| **Finnhub** | US only. Every EU symbol and every unknown symbol returns `403` | US search, quote, profile, key stats, earnings calendar, recent EPS, recommendations, news, peers, US symbol directory | 60 calls/min (headers `x-ratelimit-limit/remaining/reset`) |
| **Twelve Data** | US only (EU: `404 … available starting with the Grow plan`) | US daily OHLCV | 8 credits/min, 800/day, 1 credit per call, including `/api_usage` |
| **Yahoo Finance** (unofficial) | US + all supported EU exchanges | Everything for EU; fallback for US; FX; EU universe validation | Self-limited to ≤ 1 req/s (Yahoo's real threshold is **UNVERIFIED**) |
| **FMP** (stable API) | **Some** US symbols only: AAPL works; BRK-B, SNOW and all EU symbols answer `402 Premium Query Parameter` | Historical US earnings: report dates, EPS and revenue, estimate vs actual | 250 calls/day (from FMP's docs; not exhausted in the probe) |

## Finnhub (`https://finnhub.io/api/v1`, header `X-Finnhub-Token`)

| Endpoint | Findings |
|---|---|
| `/search?q=&exchange=US` | ~10 results `{description, displaySymbol, symbol, type}`. Types include `Common Stock`, `ADR`. **No exchange field.** Without `exchange=US` results are global (`603020.SS`, …). |
| `/stock/symbol?exchange=US` | 31,116 entries (7.4 MB) with `mic` (`XNAS` 5.7k, `XNYS` 3.0k, `XASE` 322, `ARCX`, `BATS`, `OOTC` 17.6k) and `type`. One call per day provides exchange names for search results and calendar events and filters out OTC tickers. Names are upper case (`BERKSHIRE HATHAWAY INC-CL B`). |
| `/stock/profile2` | `name, ticker, exchange` (`NASDAQ NMS - GLOBAL MARKET`), `currency, country, ipo, weburl, logo, finnhubIndustry` (single industry label, **no sector**), `shareOutstanding`, `marketCapitalization` **in millions of USD**. `BRK.B` returns the `BRK.A` profile. |
| `/quote` | `{c, d, dp, h, l, o, pc, t}`; `t` = last trade (unix seconds). |
| `/stock/metric?metric=all` | 133 metrics. Used: `52WeekHigh`, `52WeekLow`, `peTTM`, `epsTTM`, `3MonthAverageTradingVolume` and `10DayAverageTradingVolume` (**in millions of shares**). |
| `/calendar/earnings?from&to` | Market-wide US calendar: `{symbol, date, hour, quarter, year, epsEstimate, epsActual, revenueEstimate, revenueActual}`. A 7-day window held 84 events (quiet week) to 1,016 (peak week). `hour`: `bmo` 13%, `amc` 16%, empty 70% (→ `UNKNOWN`); `dmh` never seen. Revenue estimates for 86% of events. Windows 2 weeks back return actuals. |
| `/calendar/earnings?symbol=` | Per-symbol history is **not** available: AAPL 2020–2027 returned only 3 future rows. The far-future dates look estimated: AAPL `2026-10-28` vs `2026-10-29` from Yahoo (`isEarningsDateEstimate=false`) and FMP. |
| `/stock/earnings` | Last **4** quarters only (`limit` ignored): `{period (fiscal quarter end), quarter, year, estimate, actual, surprise, surprisePercent}`. No report date, no revenue. Actuals can differ from other providers (AAPL 2026-06-30: 1.91 here vs 2.02 at Yahoo and FMP). |
| `/stock/recommendation` | 4 monthly rows `{period: "2026-09-01", strongBuy, buy, hold, sell, strongSell}`. |
| `/company-news?from&to` | Many items (245 for AAPL in 7 days) `{category, datetime, headline, id, image, related, source, summary, url}`; 98% have an image. Needs our own `limit`. |
| `/stock/peers` | Up to ~12 symbols **including the symbol itself**. |

## Twelve Data (`https://api.twelvedata.com`, header `Authorization: apikey …`)

| Endpoint | Findings |
|---|---|
| `/time_series?interval=1day&outputsize=N` | Up to **5,000 bars** per call (AAPL back to 2006-11-08). Values are **strings**, newest first. `meta` has `currency, exchange, mic_code, type, exchange_timezone`. **Split-adjusted** (NVDA 2024-06-07 = 120.89 after the 10:1 split). `BRK.B` format works. 5 years ≈ `outputsize=1300`. |
| response headers | `api-credits-used` / `api-credits-left` (per minute). |
| `/api_usage` | `{current_usage, plan_limit: 8, daily_usage, plan_daily_limit: 800}`, and it costs a credit itself; use the headers instead. |
| errors | JSON `{code, message, status: "error"}`, also with HTTP 404 for plan-restricted symbols. |

## Yahoo Finance (unofficial; one adapter)

**Session.** `GET https://fc.yahoo.com` (404, sets cookie `A3`) then `GET /v1/test/getcrumb` returned an 11-character crumb directly, with no consent wall from this IP. The EU consent fallback also works: `guce.yahoo.com/consent` → form at `consent.yahoo.com` with `agree` and `reject` buttons, then POST `reject` + `csrfToken` + `sessionId`, then `copyConsent`, then `getcrumb` (query2) succeeds. **Rejecting is enough**, so the adapter never agrees to tracking. Whether the Frankfurt datacenter IP gets the consent wall is **UNVERIFIED**; the adapter tries the basic flow first and falls back to consent.

| Endpoint | Crumb | Findings |
|---|---|---|
| `v1/finance/search` | no | `quotes[]` `{symbol, quoteType, exchange, exchDisp, shortname, longname}`, **capped at 7** whatever `quotesCount` says. No currency. Global listings (`.TO`, `.F`, `.MX`, OTC) must be filtered. `region=DE&lang=de-DE` biases results toward European listings (`bank` → `DBK.DE, RBI.VI, TBCG.L, …`). `news[]` only for text queries (`q=SAP.DE` returns none). |
| `v1/finance/lookup` | yes | 25 results per page with paging, but only `{symbol, exchange, quoteType, rank}` (no names). Not used. |
| `v8/finance/chart/{s}?range=5y&interval=1d` | no | ~1,255 bars back to 2021-09-27; OHLCV arrays (nulls possible), **split-adjusted**, `events=splits` lists splits. `meta`: `currency, exchangeName, fullExchangeName, instrumentType, exchangeTimezoneName, regularMarketPrice, regularMarketTime, fiftyTwoWeekHigh/Low, regularMarketVolume`. With `range=1d`, `chartPreviousClose` is the previous session's close. Unknown symbol: `404 {chart.error.code: "Not Found"}`. |
| `v10/finance/quoteSummary/{s}` | yes | All 9 modules returned for AAPL, SAP.DE, AZN.L and CEZ.PR (details below). |
| `v6/finance/recommendationsbysymbol/{s}` | no | **5** peers (SAP.DE → `SIE.DE, ALV.DE, BAS.DE, DTE.DE, BAYN.DE`). |
| `v7/finance/quote?symbols=a,b,…` | yes | Batch quote; **invalid symbols are silently omitted**, which is ideal for validating the EU universe in a handful of calls. Has `currency, financialCurrency, marketCap, exchange, fullExchangeName, longName, earningsTimestampStart/End` (next report) and `isEarningsDateEstimate`. `earningsTimestamp` is sometimes the last report and sometimes the next. |
| `v1/finance/visualization`, `entityIdType: "sp_earnings"` | yes | **Earnings dates, current and historical, US and EU**: `{ticker, eventname, startdatetime, startdatetimetype, timeZoneShortName, epsestimate, epsactual, epssurprisepct, eventtype}`. Upcoming rows (`EAD`) carry `eventname: "Q3 2026 Earnings Announcement"` (fiscal quarter/year). Past rows (`ERA`) carry the report datetime. SAP.DE back to 2010 (67 rows), CEZ.PR 20 rows. `startdatetimetype` seen: `AMC`, `TNS` (time not supplied), `TAS` (time as specified in `startdatetime`); `BMO` presumably exists (**UNVERIFIED**). Some `TAS` times are exactly `00:00:00Z` (date-only). **No revenue fields** (400 `include field is not a field`). Also answers market-wide queries by date range and `region` (100 rows per page, every listing venue included). The older `entityIdType: "earnings"` is **stale** (newest AAPL row 2025-05-01). |
| `feeds.finance.yahoo.com/rss/2.0/headline?s={s}` | no | Per-symbol news for US **and EU** (SAP.DE: 18 items): `title, link, pubDate, description, guid`; no source or image. |
| FX `v8/finance/chart/{CCY}USD=X?range=5d` | no | All pairs work: `EURUSD=X, GBPUSD=X, CHFUSD=X, SEKUSD=X, NOKUSD=X, DKKUSD=X, PLNUSD=X, CZKUSD=X` (`meta.regularMarketPrice`). |

**quoteSummary modules**

| Module | Fields used | Notes |
|---|---|---|
| `price` | `currency, exchange, longName, marketCap, regularMarketPrice/PreviousClose/Time` | |
| `summaryDetail` | `marketCap, trailingPE, fiftyTwoWeekHigh/Low, averageVolume` | |
| `defaultKeyStatistics` | `trailingEps, sharesOutstanding` | |
| `assetProfile` | `sector, industry, website, country` | |
| `earningsHistory` | last **4** quarters: `quarter` (fiscal quarter end), `epsEstimate, epsActual, currency` | no report dates; CEZ.PR had only 2 rows |
| `earnings` | `financialCurrency`; `earningsChart.quarterly` (last 4 EPS actual/estimate, labels `3Q2025`); `financialsChart.quarterly` (last 4 **revenue actuals**) | no past revenue *estimates* |
| `calendarEvents.earnings` | `earningsDate[]`, `isEarningsDateEstimate`, `earningsAverage` (EPS est), `revenueAverage` (revenue est) | upcoming quarter only; empty for CEZ.PR |
| `earningsTrend` | `0q/+1q/0y/+1y`: `endDate`, `earningsEstimate.avg`, `revenueEstimate.avg` | CEZ.PR: EPS `null` and revenue **`0` for missing** |
| `recommendationTrend` | 4 periods `0m, -1m, -2m, -3m` × `strongBuy…strongSell` | |

**Units and currencies**
- **LSE:** `AZN.L` prices, OHLC and 52-week values are in pence (`currency: "GBp"`, 12552), but `marketCap` is in **GBP** (194.7 bn) and `trailingEps` is in **GBP** (`trailingPE` = 125.52 / 5.01). Normalize pence by dividing by 100 and relabelling as `GBP`.
- **Earnings currency ≠ trading currency:** earnings EPS and revenue are in `financialCurrency`, which differs from the trading currency for some stocks (**AZN.L reports in USD**). Every earnings value carries its own currency (`EarningsQuarter.currency` in the contract).

## FMP (`https://financialmodelingprep.com/stable`, header `apikey`)

The key also works as an `apikey` **header** (verified), so it never appears in URLs or error messages. Without a key: `401 Invalid API KEY`.

| Endpoint | Findings |
|---|---|
| `/earnings?symbol=` | **165 rows for AAPL** (1985 → next report 2026-10-29): `{date (report date), epsActual, epsEstimated, revenueActual, revenueEstimated, lastUpdated}`. No fiscal quarter/year, no report time. The free tier covers only a subset of US symbols (`BRK-B` and `SNOW` → `402`); EU symbols: `402`. |
| `/earnings-calendar` | 1 row for a 7-day window: not usable on the free tier. |
| legacy `/api/v3/...` | `403 Legacy Endpoint`: only for subscriptions from before 2025-08-31. |

## Compass Economic Calendar (`https://compasseconomiccalendar.github.io/calendar.json`, no key)

Market-moving US dates for the market-events calendar. Checked 2026-10-02: one 169 KB JSON file with `window.start`/`window.end` (2026-09-27 → 2027-10-28, 154 events) and `events[]`: `event_type`, `title`, `date_et`, `time_et`, `start_utc`, `all_day`, `market_impact` (low/medium/high), `note`, `source_url` and, for some, `typical_move.spx.ratio`. Rebuilt weekly from federalreserve.gov, FRED and TreasuryDirect. FOMC dates are confirmed to 2027-10, macro releases (CPI, jobs, GDP, PCE, ISM…) only to 2026-12-31, Treasury auctions 1–2 weeks ahead. No forecast or actual values. A one-person community project, so `market-events-refresh` fails the run (and keeps what is stored) when the feed is unavailable.

Not available for free: Finnhub's economic calendar answers "You don't have access to this resource" (premium). The ForexFactory weekly JSON (`nfs.faireconomy.media/ff_calendar_thisweek.json`) is keyless and has forecast and previous values for US/EU/UK/JP, but it is an unofficial feed of a commercial site with unclear terms and covers one week only; it is not used. FMP lists an economic calendar endpoint, unverified on the free plan.

Curated in `backend/src/main/resources/market-events.json` (checked against the official calendars on 2026-10-02): ECB monetary policy meetings (decision 14:15 CET), Bank of England MPC dates (12:00 UK) and Bank of Japan meetings (second day) up to the end of 2027, and the 2026 US midterm elections. Add the next year when the banks publish it.

## Trading 212 Public API (per-user brokerage data)

Read from the official OpenAPI file (`https://docs.trading212.com/_bundle/api.yaml`, API `v0`, status **Beta**) and the help centre on **2026-10-02**, then **checked against a real Invest account on 2026-10-02** with the read-only probe below (about 3,100 orders, 90 dividends, 200 transactions, 126 positions, account currency CZK). The probe used a live key: the owner's key was created in the real account, which the probe only reads.

**Basics**
- **Base URLs:** live `https://live.trading212.com/api/v0`, demo (paper trading) `https://demo.trading212.com/api/v0`. A key belongs to one environment.
- **Accounts:** only Invest and Stocks ISA. Account totals and positions are in the account's **primary currency** (`AccountSummary.currency`), but on multi-currency accounts a fill's or dividend's `walletImpact`/amount can be in another wallet currency (e.g. USD in a CZK account). The backend converts those at the daily close of the trade day (see PROGRESS-backend Decisions).
- **Auth:** HTTP Basic, `Authorization: Basic base64(API_KEY:API_SECRET)`. The spec still lists a second scheme, `legacyApiKeyHeader`: the raw key as the `Authorization` header (older keys without a secret).
- **Key generation** (help centre): ☰ → Settings → **API (Beta)** → Generate API key. The user picks permissions and IP access: "Unrestricted" or "Restrict access to trusted IPs" (IPs or CIDR ranges; recommended). **The secret is shown only once.** No expiry is documented.
- **Permissions (scopes)** named in the spec's 403 answers: `account`, `portfolio`, `history:orders`, `history:dividends`, `history:transactions`, `metadata`, `orders:read`, `orders:execute`, `pies:read`, `pies:write`. Earnings Tracker needs the first six. Recommend leaving `orders:execute` and `pies:write` off; the app never calls them.
- **Errors:** `401` bad API key, `403` scope missing, `408` timed out, `429` rate limited, `400` bad filter arguments (history endpoints). Error bodies are not described.

**Rate limits.** Per **account**: all keys and IPs share them. Bursts are allowed up to the limit, then the caller waits for the reset. Every response has `x-ratelimit-limit`, `x-ratelimit-period` (seconds), `x-ratelimit-remaining`, `x-ratelimit-reset` (Unix timestamp of the full reset) and `x-ratelimit-used`.

| Endpoint | Limit |
|---|---|
| `GET /equity/account/summary` | 1 / 5 s |
| `GET /equity/positions` | 1 / 1 s |
| `GET /equity/history/orders`, `/dividends`, `/transactions` | 20 / 1 min **each** |
| `GET /equity/metadata/instruments` | 1 / 50 s |
| `GET /equity/metadata/exchanges` | 1 / 30 s |
| `GET /equity/history/exports` (list CSV reports) / `POST` (request one) | 1 / 1 min / 1 / 30 s |

**Pagination** (the three history endpoints). `limit` defaults to 20, max **50**. The response is `{ items, nextPagePath }`; the next request uses the **whole `nextPagePath` string** as its path (`/api/v0/equity/history/orders?limit=50&cursor=1760346100000`), until it is `null`. Items are **newest first** (the documented cursors are millisecond timestamps that decrease). Orders and dividends take an optional `ticker` filter and a numeric cursor. Transactions take a **string** cursor and an optional `time` (date-time, "starting from").

| Endpoint | Fields (as the spec names them) |
|---|---|
| `GET /equity/account/summary` | `id` (account number), `currency`, `totalValue`, `cash { availableToTrade, inPies, reservedForOrders }`, `investments { currentValue, totalCost (cost basis of current holdings), realizedProfitLoss (all time), unrealizedProfitLoss }`. All in the account currency. |
| `GET /equity/positions[?ticker=]` | Array of `{ instrument { ticker, isin, name, currency }, quantity, quantityAvailableForTrading, quantityInPies, averagePricePaid, currentPrice, createdAt, walletImpact { currency, currentValue, totalCost, unrealizedProfitLoss, fxImpact \| null } }`. **Prices are in the instrument currency; `walletImpact` is in the account currency** (`unrealizedProfitLoss = currentValue − totalCost`; `fxImpact` only when the currencies differ). |
| `GET /equity/history/orders` | Items `{ order, fill }`. `order`: `id`, `ticker`, `instrument`, `side` (`BUY`/`SELL`), `type` (`MARKET`, `LIMIT`, `STOP`, `STOP_LIMIT`), `status` (`FILLED`, `CANCELLED`, `REJECTED`, … 11 values), `strategy` (`QUANTITY`/`VALUE`), `quantity`, `value`, `filledQuantity`, `filledValue`, `limitPrice`, `stopPrice`, `currency`, `createdAt`, `initiatedFrom` (`API`, `IOS`, `ANDROID`, `WEB`, `SYSTEM`, `AUTOINVEST`, `INSTRUMENT_AUTOINVEST`), `extendedHours`, `timeInForce`. `fill` (absent for unfilled orders): `id`, `filledAt`, `price`, `quantity`, `tradingMethod` (`TOTV`/`OTC`), `type`, `walletImpact { currency, fxRate, netValue, realisedProfitLoss, taxes[] }`. A tax is `{ name, quantity, currency, chargedAt }`, `name` one of `COMMISSION_TURNOVER`, `CURRENCY_CONVERSION_FEE`, `FINRA_FEE`, `FRENCH_TRANSACTION_TAX`, `PTM_LEVY`, `STAMP_DUTY`, `STAMP_DUTY_RESERVE_TAX`, `TRANSACTION_FEE`. |
| `GET /equity/history/dividends` | Items `{ ticker, instrument, paidOn, quantity (shares), amount (account currency), amountInEuro, currency (account), grossAmountPerShare (instrument currency), tickerCurrency, reference, type }`. `type` has ~60 values (`ORDINARY`, `DIVIDEND`, `RETURN_OF_CAPITAL`, `INTEREST`, `CAPITAL_GAINS_DISTRIBUTION`, the `…_MANUFACTURED_PAYMENT` variants for shares on loan, US tax-form categories, …). |
| `GET /equity/history/transactions` | Items `{ reference, dateTime, type, amount, currency }`. `type`: `DEPOSIT`, `WITHDRAW`, `FEE`, `TRANSFER`, `INTEREST_ON_FREE_CASH`, `LENDING_INTEREST`. `amount` is in the **transaction's** currency (not necessarily the account's). |
| `GET /equity/metadata/instruments` | Array of every tradable instrument: `{ ticker, isin, name, shortName, currencyCode, type (STOCK, ETF, …), workingScheduleId, addedOn, maxOpenQuantity, extendedHours }`. Thousands of rows. |
| `GET /equity/metadata/exchanges` | `{ id, name, workingSchedules[] { id, timeEvents[] } }`. Maps an instrument's `workingScheduleId` to an exchange name. |

**Corporate actions are fills.** `fill.type` is `TRADE` for normal trades, otherwise one of `STOCK_SPLIT`, `STOCK_DISTRIBUTION`, `FOP`, `FOP_CORRECTION`, `CUSTOM_STOCK_DISTRIBUTION`, `EQUITY_RIGHTS`, `SCRIP_STOCK_DIVIDENDS`, `STOCK_DIVIDENDS`, `STOCK_ACQUISITION`, `CASH_AND_STOCK_ACQUISITION`, `SPIN_OFF`. So stock splits arrive in the order history. **Verified:** a split is a pair of fills at the same time, `STOCK_SPLIT` with `side: SELL` and a negative quantity for the old shares and `STOCK_SPLIT` with `side: BUY` for the new ones; `realisedProfitLoss` is `0` or missing. The cost basis carries over (the engine keeps it while the quantity passes through zero).

**What T212 provides vs what the backend computes** (decided in phase 1; the engine is phase 4)

| Value | Source |
|---|---|
| Realized P/L of one sell | `fill.walletImpact.realisedProfitLoss` (account currency, **before fees**). Computed only when it is missing, the way Trading 212 does: proceeds before fees − average cost before fees. |
| Fees and taxes of one trade | Sum of `fill.walletImpact.taxes[].quantity` (sent negative; every tax seen was in the account currency). Converted with the rate implied by the fill if one ever is not. |
| Trade value | `fill.walletImpact.netValue` (account currency). `price × quantity` stays in the instrument currency for display. |
| Unrealized P/L, cost basis, current value of open positions | `GET /equity/positions` → `walletImpact` (account currency). Account totals from `GET /equity/account/summary`. |
| Average cost, current price | `averagePricePaid`, `currentPrice` from positions (instrument currency). For closed positions there is no average cost. |
| Running position size, bought/sold totals, realized P/L in a period, dividends and fees per instrument and period | Computed from the stored fills, dividends and transactions. |

**Verified on a real account (2026-10-02)**
- **Sells** have a negative `fill.quantity`; `netValue` is positive for buys and sells. The sync stores a positive quantity plus `side`.
- **`netValue` includes the fees:** what was paid on a buy (fees included), what was received on a sell (fees deducted). The FX fee (`CURRENCY_CONVERSION_FEE`), stamp duty reserve tax and the French transaction tax are the charges seen.
- **`realisedProfitLoss` is before fees** and uses the average cost before fees, in the account currency: `(netValue + fees) − averageCost × quantity`, where each buy adds `netValue − fees` to the cost. 1,102 of 1,104 sells match this to within 1%. Buys have no `realisedProfitLoss` (missing, not 0). The sells' figures add up exactly to the account summary's `investments.realizedProfitLoss` exactly.
- **History is complete:** replaying all fills (splits included) gives exactly the quantity of every open position (126 of 126) and no shares left over.
- **Several history items can share an `order.id`** (37 orders with partial fills); the stored id is `order.id` + `fill.id`.
- **Unfilled orders** (`CANCELLED`) come without `fill` and are skipped.
- **Instrument currencies** seen: USD, EUR, GBP, **GBX** (LSE pence), CHF, CAD. Positions report `averagePricePaid`/`currentPrice` in GBX for pence lines (divided by 100); `walletImpact` values are always in the account currency.
- **Dividends:** all `type: DIVIDEND`, `amount` positive in the account currency, always with `reference` and `instrument`; **no `tickerCurrency` field** (the per-share amount's currency is taken from the instrument).
- **Transactions:** `DEPOSIT`, `WITHDRAW`, `FEE`, `TRANSFER` seen, all with `reference`; amounts are **signed** (withdrawals and fees negative). A few were in another currency than the account's (USD, CHF): totals convert them at today's rate (approximate), the list shows them in their own currency.
- **Account summary and positions:** the positions' `walletImpact.unrealizedProfitLoss` add up exactly to `investments.unrealizedProfitLoss`.
- **Keys belong to one environment:** a key made in the real account answers 401 on the demo host.

**Still open:** the rate-limit headers were not recorded (the client honours them; no 429 happened during a full sync of this account); corporate actions other than splits did not occur; `LENDING_INTEREST`/`INTEREST_ON_FREE_CASH` and Madrid (`e`) tickers were not in the account.

**T212 ticker → app symbol** (verified on the account's 214 tickers; anything else gives `null`, so the instrument works without a stock-detail link):

| T212 ticker | App symbol | Rule |
|---|---|---|
| `AAPL_US_EQ`, `BRK_B_US_EQ` | `AAPL`, `BRK-B` | `_US_EQ`, currency USD; `_` inside the base → `-` |
| `SAPd_EQ` | `SAP.DE` | `d` = Xetra |
| `AZNl_EQ`, `VUAAl_EQ` | `AZN.L`, `VUAA.L` | `l` = LSE, in GBX, GBP, **USD or EUR** (ETF lines); pence divided by 100 |
| `ASMLa_EQ`, `GOLDp_EQ`, `VUAAm_EQ` | `ASML.AS`, `GOLD.PA`, `VUAA.MI` | `a` Amsterdam, `p` Paris, `m` Milan |
| `DAXEXs_EQ` | `DAXEX.SW` | `s` = **SIX Swiss** (in CHF or USD), not Stockholm |
| `RBI_AT_EQ` | `RBI.VI` | `_AT_EQ` = Vienna |
| `SANe_EQ` | `SAN.MC` | `e` = Madrid (convention, not in the account) |
| `DSV_CA_EQ` | `null` | `_CA_EQ` = Toronto, not a supported exchange |

**Checking against a real account.** An opt-in, read-only probe saves what Trading 212 returns and a `findings.md` (signs, the realized result vs. the engine's rule, fill types, currencies, ticker mapping). Put a key in `backend/.env` (git-ignored) as `T212_PROBE_API_KEY` and `T212_PROBE_API_SECRET` (and `T212_PROBE_ENV=LIVE` for a real-account key), then from `backend/`:

```bash
LIVE_T212=true ./mvnw test -Dtest=LiveT212Test
```

The output lands in `backend/target/t212-probe/` (git-ignored, contains the account's data: keep it local); the key is never written or printed.

**Not used:** order placing/cancelling (`/equity/orders/*`), pending orders, CSV exports. **Pies** (`GET /equity/pies`, `/equity/pies/{id}`, deprecated, `pies:read`) are used only for the open-positions list: name from `settings.name`, instruments with `ownedQuantity`, and `result { priceAvgValue, priceAvgInvestedValue, priceAvgResult, priceAvgResultCoef }` per pie and per instrument (a fallback if the history turns out incomplete).

## Resulting fallback chains

Configured in `application.yml` (`app.providers.chains`). Providers without a key are skipped. A provider answering `403`/`402`/"plan" errors, timing out or failing counts as unavailable, and the next one is tried.

| Capability | US | EU |
|---|---|---|
| Symbol search | Finnhub (`/search` + symbol directory) → Yahoo | Yahoo (`region=DE`) |
| Quote | Finnhub → Yahoo | Yahoo |
| Profile + key stats | Finnhub → Yahoo | Yahoo |
| Daily price history | Twelve Data → Yahoo | Yahoo |
| Earnings history (merged, preference in this order) | Finnhub calendar → FMP → Yahoo → Finnhub EPS surprises (`finnhub-eps`, fills gaps such as fiscal periods) | Yahoo |
| Market-wide earnings calendar | Finnhub | none; built from the EU universe + followed/viewed symbols |
| Recommendations | Finnhub → Yahoo | Yahoo |
| News | Finnhub → Yahoo (RSS) | Yahoo (RSS) |
| Peers | Finnhub → Yahoo | Yahoo |

## Data gaps (see Known issues in PROGRESS)

- **EU revenue estimates for past quarters:** no free source. Yahoo only has the upcoming quarter's estimate, which the jobs persist in `earnings/{symbol}` so the history fills in over time. Past EU revenue *actuals* exist only for the last 4 quarters (`financialsChart`).
- **Report times:** 70% of Finnhub calendar events have no `hour` and Yahoo often says `TNS`, which gives `UNKNOWN` with `timeAssumed = true` in the reaction math.
- **Fiscal quarter/year for older EU quarters:** Yahoo gives them only for the upcoming event; past rows have report dates but no fiscal period, so `fiscalQuarter/fiscalYear` stay `null` unless a job saw the event while it was upcoming.
- **Small EU caps** (e.g. CEZ.PR) have fewer analyst estimates: missing EPS estimates, and revenue estimates reported as `0`, which the adapter maps to `null`.
- **Provider disagreement:** EPS actuals and upcoming dates can differ between providers. The merge order decides (Finnhub → FMP → Yahoo for history), and a confirmed Yahoo date (`isEarningsDateEstimate=false`) is noted separately.
- **Peers:** Yahoo returns at most 5 (contract allows 8).
- **Finnhub news, profiles and peers exist only for US symbols.** EU news comes from Yahoo RSS, which has no source name or image.

## Re-checking the providers

Yahoo's endpoints are unofficial. To check that every adapter still works against the real APIs (about 25 calls, keys from `backend/.env`):

```bash
LIVE_PROVIDERS=true ./mvnw test -Dtest=LiveProvidersTest
```

Last run: 2026-09-27, all providers passing.

## UNVERIFIED

- Yahoo's behaviour from the Frankfurt datacenter IP (consent wall, stricter throttling). The adapter handles both the direct and the consent flow.
- Yahoo's real rate-limit threshold; we self-limit to ≤ 1 req/s and back off on `429`.
- `BMO` as a Yahoo `startdatetimetype` value.
- FMP's 250/day enforcement and Twelve Data's daily reset time (assumed 00:00 UTC); both are tracked with counters and treated as exhausted on `429`.
