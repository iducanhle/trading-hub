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

## Resulting fallback chains

Configured in `application.yml` (`app.providers.chains`). Providers without a key are skipped. A provider answering `403`/`402`/"plan" errors, timing out or failing counts as unavailable, and the next one is tried.

| Capability | US | EU |
|---|---|---|
| Symbol search | Finnhub (`/search` + symbol directory) → Yahoo | Yahoo (`region=DE`) |
| Quote | Finnhub → Yahoo | Yahoo |
| Profile + key stats | Finnhub → Yahoo | Yahoo |
| Daily price history | Twelve Data → Yahoo | Yahoo |
| Earnings history (merged, preference in this order) | Finnhub → FMP → Yahoo | Yahoo |
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

## UNVERIFIED

- Yahoo's behaviour from the Frankfurt datacenter IP (consent wall, stricter throttling). The adapter handles both the direct and the consent flow.
- Yahoo's real rate-limit threshold; we self-limit to ≤ 1 req/s and back off on `429`.
- `BMO` as a Yahoo `startdatetimetype` value.
- FMP's 250/day enforcement and Twelve Data's daily reset time (assumed 00:00 UTC); both are tracked with counters and treated as exhausted on `429`.
