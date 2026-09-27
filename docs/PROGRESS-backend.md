# Backend progress

**How to resume:** the spec is [PROMPT-backend.md](PROMPT-backend.md) (phases in §14), the API contract is [CONTRACT.md](CONTRACT.md), and this file is the current state. Continue from **In progress**, then **Next**. Update this file after every completed item.

## Phase status

| Phase | Status |
|---|---|
| 0 – Setup | Done |
| 1 – Skeleton | Done |
| 2 – Providers | Done |
| 3 – Domain + REST | Next (waiting for "continue") |
| 4 – Jobs + email | Not started |
| 5 – Deployment | Not started |

## Done

**Phase 0 – Setup**
- Saved the prompt verbatim to `docs/PROMPT-backend.md` (byte-identical copy).
- Monorepo skeleton: `backend/`, `frontend/` (placeholder README), `docs/`, `deploy/`, `.github/workflows/`. Root `.gitignore` (secrets, Maven, Node/Angular, Firebase CLI, IDE), `.gitattributes` (LF), `backend/.env.example` (placeholders only).
- `docs/CONTRACT.md`: §10 verbatim (checked with `diff`), plus a title, a note on where it came from, and a changelog table for future API changes.
- Root `README.md`: layout, architecture, documentation index.

**Phase 1 – Skeleton**
- Scaffolded `backend/` (Spring Initializr): Spring Boot 4.1.1, Java 25, Maven wrapper 3.3.4 (Maven 3.9.16). `com.earningstracker`, jar `target/earnings-tracker.jar`.
- `application.yml` + `local` (default) / `prod` profiles, typed `@ConfigurationProperties` records. The `local` profile imports `backend/.env` via `DotenvPropertySourceLoader` (unit-tested).
- Firebase Admin SDK init (`FirebaseAppHolder`): optional locally (warns, auth disabled), required in `prod` (fails fast with an actionable message).
- Security: `FirebaseAuthenticationFilter` + `TokenVerifier` (wraps `verifyIdToken`), `EmailAllowlist` (case-insensitive), CORS for `/api/**` from `CORS_ALLOWED_ORIGINS`. `GET /api/health` and Swagger UI are public; everything else needs the `ALLOWED` authority.
- Error handling: `GlobalExceptionHandler` + `JsonErrorController` (`/error`) + `ApiErrorWriter` (security chain) all produce `{ code, message }`, including firewall rejections.
- `GET /api/health`, `GET /api/me`; Actuator exposes `health` only, behind auth. Swagger UI at `/swagger-ui.html` with a Firebase bearer "Authorize" button.
- `backend/Dockerfile` + `.dockerignore`, `deploy/docker-compose.yml` (app + Caddy, key mounted as a compose secret at `/run/secrets/firebase-sa.json`) and `deploy/Caddyfile`. Verified on Docker 29.8 (2026-09-27):
  - `docker build` from source (native amd64): OK, 131 s cold.
  - `docker buildx build --platform linux/arm64 --build-arg JAR_SOURCE=prebuilt`: OK in 13 s. The Maven stage was skipped and the arm64 stage is only `COPY`, so no emulation. The image is `linux/arm64`, runs as uid 1000, pulls about 207 MB.
  - The arm64 image starts under QEMU (`aarch64`, JDK 25.0.4.1, `/api/health` UP).
  - Full stack via the real compose file (`DOMAIN=localhost`, throwaway service-account key): app healthy after 12 s, `prod` profile, Firebase initialized. Through Caddy TLS: `/api/health` 200, `/api/me` 401 JSON, a bad token returns 401 `INVALID_ID_TOKEN` from the real verifier, `/actuator/health` and `/` 404 at the edge, HTTP→HTTPS 308, HSTS set, `Server` header removed.
  - `caddy validate` (Caddy 2.11.4): valid, already formatted.
- Tests (21, all green): security integration tests (401 missing/invalid token, 403 not allowlisted, 403 unverified, 200 `/api/me`, 404 format, CORS preflight allow/deny, public docs, protected actuator), allowlist, Firebase startup, `.env` parser.

**Phase 2 – Providers**
- Probe results in `docs/DATA-SOURCES.md`.
- `market` package: `Exchange` registry (suffix, currency, timezone, session hours → BMO/DMH/AMC classification), `Symbols` (canonical validation, region, `BRK-B` ↔ `BRK.B`), `Money` (pence → GBP), `PriceBars` (drops the unfinished session), plain records shared by all providers.
- `provider` package: 9 capability interfaces + `FxRateProvider`; `ProviderRouter` (per-region fallback chains from `app.providers.chains`, validated at startup; `first` and `all` modes); `ProviderHttp` (Resilience4j rate limiter + retry with exponential backoff and jitter, daily quotas, safe error mapping).
- Adapters: `FinnhubProvider` (+ US symbol directory), `TwelveDataProvider`, `YahooProvider` (+ `YahooSession` cookie/crumb/consent, `YahooEarnings` merge), `FmpProvider`; 43 adapter and infrastructure tests on MockWebServer with small recorded fixtures.
- Cache: `DocumentStore` (Firestore via Admin SDK; no-op without Firebase; read/write counters) and `TieredCache` (Caffeine L1 + Firestore L2 `{data, updatedAt}`, stale fallback, store failures degrade to memory).
- `FxService`: USD rates for EUR, GBP, CHF, SEK, NOK, DKK, PLN, CZK via Yahoo, cached 24 h in L1 and `fx/latest`.
- `eu-universe.csv`: 333 symbols (DAX 40, CAC 40, AEX, FTSE 100, SMI, IBEX 35, FTSE MIB, OMXS30, PX), built from Wikipedia constituent tables, all validated on Yahoo on 2026-09-27; `EuUniverse` re-validates in the background at startup (~7 batch requests).
- Live verification (2026-09-27): `LiveProvidersTest` (opt-in, `LIVE_PROVIDERS=true`) passed against the real Yahoo, Finnhub, Twelve Data and FMP APIs, and caught a null-handling bug the fixtures had missed (fixed). Running the app with the local `.env`: Yahoo session via the direct cookie + crumb, and "EU universe: all 333 symbols are known to Yahoo".
- 89 tests (4 of them the opt-in live tests, skipped by default).

## In progress

- Nothing. Waiting for "continue" to start Phase 3.

## Next

**Phase 3 – Domain + REST** (done when all tests pass and the smoke script works locally):
- [ ] Pure, unit-tested calculators (§5): performance summary (w1/m1/ytd/y1, live quote when newer than the last bar); history aggregation DAILY/WEEKLY (ISO weeks)/MONTHLY with the unfinished period as `partial: true` and `before` cursor pagination; earnings result + surprise %; price reaction (BMO/DMH/AMC/UNKNOWN, `timeAssumed`, N = `app.earnings.window-days`); earnings stats (beat rate, streak, avg |reaction|).
- [ ] Earnings merge across providers via `ProviderRouter.all` (Finnhub → FMP → Yahoo): dedupe by fiscal (year, quarter) or report date, attach dateless fiscal rows to the first report within 100 days after the period end, max 12 quarters, accumulate in `earnings/{symbol}`.
- [ ] Price history service: `prices/{symbol}` (≤ 5 years, oldest first, compact `{d,o,h,l,c,v}`), incremental top-up, full refetch when overlapping bars disagree (split or correction), stale after 1 trading day.
- [ ] Profile service: `symbols/{symbol}` (7 days), `marketCapUsd` via `FxService`, logo fallback `https://www.google.com/s2/favicons?domain={domain}&sz=128` else null; fill missing fields (e.g. sector) from the next provider in the chain.
- [ ] Every endpoint in `docs/CONTRACT.md`: search, stock overview, prices (+ earnings markers), history, earnings, recommendations, news, peers, calendar (`earningsCalendar/{date}` docs, L1 10 min, ≤ 42 days, filters), followed earnings (`users/{uid}/follows`), `viewed/{symbol}` at most once per symbol per day.
- [ ] Validation → 400 `BAD_REQUEST`; `ProviderException` → `SYMBOL_NOT_FOUND` / `RATE_LIMITED` / `UPSTREAM_UNAVAILABLE`; `stale: true` when served from cache after a provider failure.
- [ ] `backend/scripts/smoke.sh`: `/api/health`, then the main endpoints for AAPL and SAP.DE given a token.

Later: Phase 4 jobs + email; Phase 5 deployment docs + CI (see §14).

Notes for Phase 5:
- GHCR is free only for **public** packages; private packages get 500 MB storage and 1 GB transfer per month on the free plan. The image contains no secrets, so the guide should make the package public, or the workflow should prune old versions.
- Build with `--build-arg JAR_SOURCE=prebuilt` after `./mvnw verify` (verified above).

## Known issues

Data gaps (details in `docs/DATA-SOURCES.md`); the API returns `null` for these, never an invented value:
- **EU revenue estimates for past quarters:** no free source. Only the upcoming quarter has an estimate (Yahoo); the jobs persist it in `earnings/{symbol}`, so EU history gains revenue estimates only for quarters observed while upcoming.
- **EU revenue actuals** exist only for the last 4 quarters (Yahoo `financialsChart`), and EU fiscal quarter/year only for events seen while upcoming.
- **Report times are often unknown:** 70% of Finnhub calendar events have no hour and Yahoo often says "time not supplied", so reactions for those quarters use the `UNKNOWN` rule with `timeAssumed = true`.
- **Small caps** (e.g. CEZ.PR) often lack analyst estimates; Yahoo reports missing revenue estimates as 0, which becomes `null`.
- **FMP free tier covers only some US symbols** (AAPL yes; BRK-B, SNOW no); Finnhub + Yahoo still cover them.
- **Peers:** Yahoo returns at most 5 (EU); **EU news** (Yahoo RSS) has no source name or image.
- **Providers can disagree** on EPS actuals and upcoming dates; the merge order decides (Finnhub → FMP → Yahoo).
- **`COLTCZ.PR`** is a valid Yahoo symbol with almost no data (no name or currency in quotes).
- **EU universe:** all 333 symbols valid on Yahoo as of 2026-09-27 (none to list as invalid). Index membership changes quarterly; the CSV is refreshed manually.
- **UNVERIFIED:** Yahoo behaviour from the Frankfurt datacenter IP (the consent fallback is implemented and tested), Yahoo's real rate threshold, `BMO` as a Yahoo time type, FMP/Twelve Data daily reset times.

Engineering:
- Daily provider quotas are in-memory counters; a restart resets them (a provider 429 then falls back to the next provider).
- **Tooling quirk (Windows):** `kill $!` from Git Bash may not stop a `java.exe` started in the background; stop it with PowerShell `Stop-Process -Id <pid>` (find it with `Get-NetTCPConnection -LocalPort 8080`).
- Malformed URLs rejected by Tomcat itself (an encoded slash `%2F`) get Tomcat's HTML 400 page instead of the JSON error body, because they never reach Spring. Valid symbols never contain these characters.

## Decisions

- **2026-09-26 — Versions: Spring Boot 4.1.1, Java 25.** Latest stable Boot (start.spring.io metadata) and latest LTS (Adoptium API `most_recent_lts`), checked on this date.
- **2026-09-26 — Commits go straight to `main`, not pushed.** Solo repo; the Phase 5 CI workflow triggers on pushes to `main`. Pushing is left to the owner.
- **2026-09-26 — `.gitattributes` forces LF line endings.** This machine has `core.autocrlf=true`, which would check out `mvnw` and `*.sh` with CRLF and break them inside Linux containers built from the Windows working tree. `*.cmd`/`*.bat` stay CRLF.
- **2026-09-26 — Root `.gitignore` rewritten for the monorepo.** Patterns are unanchored so they apply in `backend/` and `frontend/`. Lockfiles are no longer ignored, because `npm ci` in CI needs `frontend/package-lock.json`. Service-account keys are covered by `secrets/`, `*firebase-sa*.json`, `*-firebase-adminsdk-*.json` and similar patterns.
- **2026-09-26 — `.env.example` differs slightly from §11 in form, not content.** Comments are on their own lines, because some dotenv parsers keep inline comments as the value (an empty `FMP_API_KEY` would read as `# optional` and look set). `MAIL_FROM_NAME` is quoted so the file stays shell-sourceable. Same keys and placeholders as §11.
- **2026-09-27 — `.env` loading: a small custom `PropertySourceLoader`, imported only by the `local` profile** (`spring.config.import=optional:file:.env[.env]`), instead of spring-dotenv. Tests never read the real `.env`, Windows backslash paths survive (the built-in `[.properties]` import treats `\` as an escape), parsing follows Docker Compose's env-file rules (quotes, `export`, ` #` inline comments), and there is no third-party Boot 4 compatibility risk. Real environment variables still win.
- **2026-09-27 — Default profile is `local`** so `./mvnw spring-boot:run` just works; the Docker image sets `SPRING_PROFILES_ACTIVE=prod`.
- **2026-09-27 — Tests use JUnit Jupiter 6 (6.0.3, managed by Boot 4.1).** §3 says JUnit 5; Jupiter 6 is its successor with the same API. Mockito is loaded as a Surefire `-javaagent` because JDK 21+ warns about (and future JDKs block) self-attaching agents.
- **2026-09-27 — Virtual threads enabled** (`spring.threads.virtual.enabled`): request handling is mostly blocking I/O to providers and Firestore.
- **2026-09-27 — Firebase is optional in `local`, required in `prod`.** Locally the app starts without a key (warning; every protected call is 401) so it can run before Firebase exists. In prod a missing key fails startup: a crash with a clear log line is easier to diagnose than a healthy-looking app that rejects every login. Credentials come only from the configured file (no Application Default Credentials probing), so tests and local runs never pick up stray gcloud credentials.
- **2026-09-27 — Auth semantics.** Tokens are verified with `verifyIdToken` without the revocation check (that would add a network call per request). Missing/invalid token → 401 via the entry point. A valid token whose email is not allowlisted, or not verified, is authenticated *without* the `ALLOWED` authority → 403 via the access-denied handler. The 403 message says which check failed ("not on the allowlist" / "not verified"). Denials are logged with uid and email; tokens are never logged.
- **2026-09-27 — `/api/health` is a liveness check that always says `UP` while the app serves requests.** `HEAD` is public too, because uptime monitors (e.g. UptimeRobot) probe with `HEAD` by default. Actuator exposes only `health`, and it needs a token (§9: `/api/health` is the only public endpoint). Wiring `/api/health` to Actuator's aggregate would make it depend on indicators such as SMTP once mail is added.
- **2026-09-27 — CORS** applies to `/api/**` only: methods GET/POST, headers `Authorization` and `Content-Type`, no credentials (bearer tokens, no cookies), preflight cached for 1 h.
- **2026-09-27 — Contract: added error codes `404 NOT_FOUND`, `405 METHOD_NOT_ALLOWED`, `500 INTERNAL_ERROR`** (see the changelog in `CONTRACT.md`), so every error response carries a documented code.
- **2026-09-27 — `UserDetailsServiceAutoConfiguration` excluded.** There is no username/password login, and it would log a generated password at startup.
- **2026-09-27 — Dockerfile: no emulation for arm64.** Build stages use `--platform=$BUILDPLATFORM` (the jar is platform-independent) and the final `eclipse-temurin:25-jre` stage has no `RUN` step, so `buildx --platform linux/arm64` on x86 needs no QEMU. `--build-arg JAR_SOURCE=prebuilt` makes CI reuse the jar that `./mvnw verify` already tested instead of compiling twice. Runs as uid 1000 (`ubuntu` in both the image and on the Oracle VM, so the `chmod 600` key stays readable). Spring Boot layered extraction for smaller updates.
- **2026-09-27 — Compose:** image `${APP_IMAGE:-ghcr.io/iducanhle/earnings-tracker-backend:latest}`; the service-account key is a compose secret mounted at `/run/secrets/firebase-sa.json`, and compose pins `GOOGLE_APPLICATION_CREDENTIALS` to that path whatever `.env` says. The healthcheck uses bash `/dev/tcp`, because the JRE image has neither curl nor wget (checked in Adoptium's Dockerfile). A missing `DOMAIN` fails fast.
- **2026-09-27 — Caddy proxies only `/api/*` and the Swagger/OpenAPI paths**; everything else (including `/actuator`) is 404 at the edge. HSTS on, `Server` header removed, TCP 80/443 only (no HTTP/3, so the Oracle security list needs no UDP rule).
- **2026-09-27 — Yahoo EU consent: decline, never agree.** The basic cookie + crumb flow works from Czechia; the consent fallback posts `reject`, which still yields a working crumb (verified). This is the privacy-preserving variant of yfinance's approach.
- **2026-09-27 — Yahoo `sp_earnings` (visualization API) is the EU earnings-history source:** it has past report datetimes (and so report times), EPS estimate/actual, and the upcoming event with fiscal quarter/year. The older `earnings` entity is stale since 2025-05. It has no revenue, so EU revenue actuals come from `quoteSummary.earnings.financialsChart` (last 4 quarters).
- **2026-09-27 — US search = Finnhub `/search?exchange=US` + Finnhub symbol directory** (`/stock/symbol?exchange=US`, one call per day) for exchange names and to drop OTC/ETF listings. The directory also names the ~1,000 weekly US calendar events without per-symbol profile calls. EU search = Yahoo search with `region=DE` (European listings first).
- **2026-09-27 — EU news = Yahoo RSS** (`feeds.finance.yahoo.com/rss/2.0/headline?s=`), because Finnhub news is US-only and Yahoo search returns news only for text queries.
- **2026-09-27 — A Finnhub `403` means "try the next provider", never "symbol not found"**: Finnhub answers `403` both for EU/premium data and for unknown symbols. `SYMBOL_NOT_FOUND` comes only from Yahoo's `404` (or empty results from every provider).
- **2026-09-27 — FMP is US-only** (EU returns `402`), so it sits in the US earnings chain only.
- **2026-09-27 — Resilience4j core modules** (`ratelimiter`, `retry`) without the Spring Boot integration, avoiding Boot 4 compatibility risk. Each provider gets a smooth limiter (1 permit per `min-interval`: Finnhub 1.1 s, Twelve Data 7.5 s, Yahoo 1 s, FMP 1 s). Only transient failures are retried (5xx, 429, I/O): 3 attempts, backoff 500 ms doubling with ±50% jitter. A retried attempt takes a new permit.
- **2026-09-27 — Daily quotas are in-memory counters per UTC day** (Twelve Data 790, FMP 240: margins below 800/250). A restart resets them; if a provider then answers 429 the chain falls back, which is acceptable for two users.
- **2026-09-27 — API keys travel only in headers** (`X-Finnhub-Token`, `Authorization: apikey`, `apikey`), so they never appear in URLs, and `ProviderException` messages never contain URLs. Tests assert that no request target contains the key.
- **2026-09-27 — Zero estimates become `null`** (Yahoo `earningsTrend`/`calendarEvents` revenue, Finnhub calendar `revenueEstimate`): providers use 0 for "no estimate". Actuals keep genuine zeros (pre-revenue companies).
- **2026-09-27 — Router outcome when every provider fails:** `NOT_FOUND` only if some provider said not-found and nothing failed transiently (a timeout proves nothing); `RATE_LIMITED` if all were rate limits; `UNSUPPORTED` if all declined; else `UNAVAILABLE`. Unexpected adapter exceptions count as `BAD_RESPONSE` and the chain moves on.
- **2026-09-27 — `EarningsReport.date` may be null** for rows that only know their fiscal period (Finnhub's last-4 EPS, Yahoo `earningsHistory` without a matching dated report). Phase 3's merge attaches them to a dated report or drops them. Quarter-level values attach to the first report within 100 days after the quarter end.
- **2026-09-27 — Daily bars never include an unfinished session:** today's bar is dropped until 30 min after the exchange close (providers publish partial bars intraday).
- **2026-09-27 — Yahoo quote = chart `range=1d`** (no crumb needed). A crumb is used only for quoteSummary, batch quotes and the visualization API; a 401/403 renews the session once.
- **2026-09-27 — EU universe built from Wikipedia constituent tables** (queried through the MediaWiki API; PX from its component list as of August 2026, symbols found via Yahoo search or batch quote). Companies in two indices are listed once, under their primary market: `REN.AS`, `SHELL.AS`, `UNA.AS`, `IAG.MC`, `MTS.MC`, `STLAP.PA`, `STMMI.MI`, `ABB.ST` and `AZN.ST` are left out; users can still follow them. Membership is as of 2026-09-27; refreshing the CSV is a manual step (rerun the build).
- **2026-09-27 — Startup validation uses Yahoo batch quotes** (50 symbols per request, ~7 requests) instead of one request per symbol; unknown symbols are logged and excluded from `validMembers()`. Disabled in tests (`app.universe.validate-on-startup=false`).
- **2026-09-27 — L2 documents are `{data, updatedAt}`** (Jackson-converted maps; `updatedAt` a Firestore Timestamp), so any record type can be cached without Firestore mapping annotations. L1 keeps entries for max(1 day, 2× freshness), so a stale copy survives provider outages.
- **2026-09-27 — Opt-in live provider test** (`LIVE_PROVIDERS=true ./mvnw test -Dtest=LiveProvidersTest`, ~25 real calls): Yahoo's endpoints are unofficial and can change, so there is a one-command check. It is skipped in normal builds and CI.
- **2026-09-26 — File locations.** `backend/Dockerfile`; `deploy/docker-compose.yml` and `deploy/Caddyfile` (the VM's `/opt/earnings-tracker` mirrors `deploy/` plus `.env` and the key).
