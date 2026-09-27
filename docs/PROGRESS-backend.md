# Backend progress

**How to resume:** the spec is [PROMPT-backend.md](PROMPT-backend.md) (phases in §14), the API contract is [CONTRACT.md](CONTRACT.md), and this file is the current state. Continue from **In progress**, then **Next**. Update this file after every completed item.

## Phase status

| Phase | Status |
|---|---|
| 0 – Setup | Done |
| 1 – Skeleton | Done |
| 2 – Providers | Done |
| 3 – Domain + REST | Done |
| 4 – Jobs + email | Done |
| 5 – Deployment | Done |

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

**Phase 3 – Domain + REST**
- `domain`: `PerformanceCalculator`, `HistoryCalculator` (DAILY/WEEKLY/MONTHLY, partial periods, cursor pages), `EarningsMath` (result, surprise), `ReactionCalculator` (BMO/DMH/AMC/UNKNOWN), `EarningsStatsCalculator`, `EarningsMerger`; unit-tested with hand-checkable series.
- `service`: `QuoteService` (L1 60 s), `ProfileService` (`symbols/`, 7 d, fill-in from next provider, `marketCapUsd`, favicon logo), `PriceService` (`prices/`, incremental top-up, refetch on split/correction), `EarningsService` (`earnings/`, accumulating merge, `record()` for jobs), `StockExtrasService` (news/recommendations/peers), `SearchService`, `CalendarService` (`earningsCalendar/`), `FollowService`, `FollowedEarningsService`, `ViewTracker` (`viewed/`), `StockService` (composes the stock detail responses).
- `web`: `StockController`, `CalendarController`, contract DTOs (`Dtos`), provider failures → `SYMBOL_NOT_FOUND`/`RATE_LIMITED`/`UPSTREAM_UNAVAILABLE`. `docs/CONTRACT.md` gained "Implementation notes" (no field changes).
- Firebase emulator mode (`FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST`; refused in prod), `backend/emulator/firebase.json`, `scripts/emulator-token.sh` (verified test user → ID token), `scripts/smoke.sh`.
- End-to-end run (2026-09-27): local Auth + Firestore emulators, real provider APIs, `smoke.sh` passed all 23 checks (health, me, search, all stock endpoints for AAPL and SAP.DE, calendar, followed earnings, 404, 400) in 33 s from cold caches. Firestore received `symbols/`, `prices/`, `earnings/`, `viewed/`, `fx/latest`. Spot checks: AAPL merges Finnhub (fiscal quarter, AMC), FMP (revenue) and Yahoo (sector, confirmed date); SAP.DE has 12 quarters with reactions, verified by hand against the bars.
- The run exposed two earnings-merge issues, fixed: Finnhub EPS surprises outranked FMP/Yahoo (AAPL showed MISS; now BEAT), and merged records were stored with a single source tag (see Decisions).
- 139 tests (4 opt-in live tests skipped by default).

**Phase 4 – Jobs + email**
- `jobs`:
  - `JobRunner`: one lock per job, so runs never overlap. Manual triggers run in the background. Every run is recorded in `jobRuns/{jobName}`: `lastStart`, `lastSuccess`, `lastResult`, `lastError`, and `stats` with the measured Firestore reads and writes.
  - `JobScheduler`: the Europe/Prague crons, plus a `calendar-refresh` at startup when its last success is older than 24 h. `JOBS_ENABLED=false` turns both off.
  - `TrackedSymbols`: symbols followed by any user, plus those viewed in the last 30 days.
- `calendar-refresh` (06:00):
  - Refreshes FX rates and the profiles of followed stocks.
  - Fetches the Finnhub US calendar in 7-day chunks from today−14 to today+45. Names come from one `LISTINGS` batch. Market cap and logo come from profile basics: nearest dates first, at most 1,500 calls per run, reusing profiles up to 30 days old.
  - Records every event in `earnings/{symbol}`.
  - EU: stored data for the universe, plus a fresh fetch for followed and viewed symbols.
  - Writes `earningsCalendar/{date}` only when the day changed. A failed US chunk keeps that range's stored US events.
- `eu-universe-refresh` (Sunday 03:00): earnings and market cap for the 333 universe symbols, through Yahoo's 1 req/s limiter. Symbols refreshed in the last 6 days are skipped, so a rerun resumes where the last one stopped.
- `prices-refresh` (23:30): incremental bars for tracked symbols, plus a fresh earnings fetch wherever a report from the last 7 days still lacks its actual.
- `earnings-digest` (12:00) and the `notification` package:
  - `UserDirectory` reads the settings in `users/{uid}`, with the contract defaults.
  - `DigestService` lists followed stocks with a date in [today+1, today+notifyDaysBefore], from stored data.
  - Thymeleaf template `templates/email/digest.html` (inline CSS; logo or initials, date, report time, EPS and revenue estimates, links to `{APP_BASE_URL}/stock/{symbol}`) plus a plain-text part. Sent through Gmail SMTP (587, STARTTLS).
  - Recipients must still be allowlisted and verified (checked through Firebase Auth).
  - `notificationLog/{uid}_{date}` is written after a successful send, so reruns skip users who already got theirs.
- Endpoints (contract implementation notes updated; no field changes):
  - `POST /api/admin/jobs/{jobName}/run` → 202 `{ jobName, startedAt }`.
  - `POST /api/notifications/test` → 202 `{ sentTo }`: a 7-day window or sample data, 1 per minute per user, 503 without mail settings.
- Tests (158 in total; the 4 opt-in live tests are skipped):
  - `JobRunnerTest`: stats, `jobRuns`, failures, the lock.
  - `CalendarRefreshJobTest`: chunks, the profile budget, change-only writes, outages.
  - `EarningsDigestJobTest`, with real SMTP into GreenMail: subjects, both parts, links, per-user windows, allowlist and verification, idempotency, a failed send, no mail settings.
  - `TestEmailIntegrationTest`: the full Spring context with env-var mail config, Thymeleaf auto-configuration and GreenMail.
  - Web tests for the admin and test-email endpoints.
- Live run (2026-09-27) against the Auth and Firestore emulators with the real providers. Mail went to a local GreenMail catcher, so no real email was sent.
  - Manual trigger of `calendar-refresh` → 202. A second trigger while it ran returned the running job's `startedAt`; an unknown job → 400.
  - `calendar-refresh`, with the budget lowered to 60 profile calls:
    - 159 s; 3,496 US events for 3,466 symbols (all 9 chunks); 45 of 60 days written.
    - **7,329 Firestore reads and 3,573 writes** (first run into an empty database).
    - `/api/calendar` then served the days sorted by market cap (e.g. MU on 2026-09-30, cross-checked against its quote).
  - `earnings-digest` → "Earnings tomorrow: NKE" (6 reads, 3 writes). A rerun → `alreadySent=1`, nothing sent.
  - `POST /api/notifications/test` → 202 `{"sentTo":"dev@example.com"}` with "[Test] Upcoming earnings: NKE, MU". Checked at phone width: logos, times, estimates, links. A second call within the minute → 429.
  - `prices-refresh` → 4 tracked symbols priced (11 reads, 3 writes).
  - `eu-universe-refresh`:
    - 999 s for 333 symbols (332 refreshed, 1 already fresh, 0 failures).
    - About 1,000 Yahoo requests at 1/s, with no throttling.
    - 999 reads, 664 writes.
  - A second `calendar-refresh` right after, following a restart (so an empty memory cache):
    - 6,999 reads and **96 writes**; unchanged events and days are not rewritten.
    - 172 EU events added, e.g. SAP.DE on 2026-10-21 and UBSG.SW on 2026-10-28 (BMO).

**Phase 5 – Deployment**
- `deploy/docker-compose.yml` (final):
  - Services: app, Caddy, and a DuckDNS updater (`lscr.io/linuxserver/duckdns`: every 5 min, IPv4, subdomain and token from `.env` and required).
  - Log rotation (3 × 10 MB per container) and a healthcheck `start_interval` of 5 s, so deploys see "healthy" quickly. `APP_IMAGE` allows a rollback.
  - Validated with `docker compose config`; missing required variables fail with a clear message.
  - All three images publish linux/arm64 (checked with `docker buildx imagetools inspect`).
- `.github/workflows/backend.yml` runs on pushes to `main` that touch `backend/**`, `deploy/**` or the workflow, and on manual dispatch. Pull requests run the tests only.
  1. `./mvnw -B verify` on Temurin 25 with the Maven cache; test reports are kept on failure.
  2. A linux/arm64 image built with buildx from the tested jar (`JAR_SOURCE=prebuilt`, no QEMU), pushed to GHCR as `latest` and `sha-<short>`, with a GitHub Actions layer cache.
  3. Deploy over SSH with a pinned host key: copies `docker-compose.yml` and `Caddyfile`, runs `docker compose pull && up -d`, and waits up to 3 min for the healthcheck (otherwise it prints the log and fails). Then it prunes old images.
  - Deploy runs only when the repository variable `DEPLOY_ENABLED` is `true`.
  - Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, plus the automatic `GITHUB_TOKEN`.
- **Workflow lint passes:**
  - actionlint 1.7.12, which also runs shellcheck 0.11 on the `run:` scripts: 0 findings.
  - `shellcheck -S style` on `backend/scripts/*.sh`: clean.
- `docs/DEPLOYMENT-backend.md` covers everything in §13 for a first-time deployer:
  - Firebase, API keys, Gmail app password.
  - Oracle Frankfurt: PAYG, $1 budget, A1 Flex 2 OCPU / 12 GB Ubuntu 24.04 aarch64, SSH, ports 80/443 in the security list and in iptables.
  - DuckDNS, server setup, CI/CD, the verification checklist, operations, and $0 checks.
  - Each step says what you should see; troubleshooting is included.
- `backend/scripts/firebase-token.sh`: an ID token for an Email/Password user of the real project (sign-up with a verification email, then sign-in). The verification checklist needs it before the frontend exists.
- `backend/README.md`: local development (quick start, emulators, jobs, email with a mail catcher, tests, Docker, configuration reference, code layout).
- The arm64 image, rebuilt from the Phase 4 jar with `JAR_SOURCE=prebuilt`: 13 s, linux/arm64, uid 1000, 210 MB; the jar contains the email template.

## In progress

Nothing: all phases are done.

## Next

Nothing left in the backend spec. For the owner:
- Deploy by following [DEPLOYMENT-backend.md](DEPLOYMENT-backend.md).
- Set `MAIL_APP_PASSWORD` locally if you want the test email from your own machine.
- The frontend (prompt 2) builds against [CONTRACT.md](CONTRACT.md).

## Known issues

Data gaps (details in `docs/DATA-SOURCES.md`); the API returns `null` for these, never an invented value:
- **EU revenue estimates for past quarters:** no free source. Only the upcoming quarter has an estimate (Yahoo); the jobs persist it in `earnings/{symbol}`, so EU history gains revenue estimates only for quarters observed while upcoming.
- **EU revenue actuals** exist only for the last 4 quarters (Yahoo `financialsChart`), and EU fiscal quarter/year only for events seen while upcoming.
- **Report times are often unknown:** 70% of Finnhub calendar events have no hour and Yahoo often says "time not supplied", so reactions for those quarters use the `UNKNOWN` rule with `timeAssumed = true`.
- **Small caps** (e.g. CEZ.PR) often lack analyst estimates; Yahoo reports missing revenue estimates as 0, which becomes `null`.
- **FMP free tier covers only some US symbols** (AAPL yes; BRK-B, SNOW no); Finnhub + Yahoo still cover them.
- **Peers:** Yahoo returns at most 5 (EU); **EU news** (Yahoo RSS) has no source name or image.
- **Providers can disagree** on EPS actuals and upcoming dates; the merge order decides (Finnhub calendar → FMP → Yahoo → Finnhub EPS surprises). Example: Finnhub's EPS-surprise endpoint reports AAPL FQ3-2026 actual 1.91 while FMP and Yahoo report 2.02; the displayed value is 2.02.
- **`COLTCZ.PR`** is a valid Yahoo symbol with almost no data (no name or currency in quotes).
- **EU universe:** all 333 symbols valid on Yahoo as of 2026-09-27 (none to list as invalid). Index membership changes quarterly; the CSV is refreshed manually.
- **UNVERIFIED:** Yahoo behaviour from the Frankfurt datacenter IP (the consent fallback is implemented and tested), Yahoo's real rate threshold, `BMO` as a Yahoo time type, FMP/Twelve Data daily reset times.

Deployment:
- **The deployment path is verified in pieces, not end to end.** The guide and the workflow could not be run against real Oracle, Firebase, DuckDNS and GitHub accounts from here. What was checked:
  - the workflow is linted
  - the compose file is validated
  - the arm64 image builds
  - the full compose stack with Caddy TLS ran locally in Phase 1

  The first real run may hit renamed console labels or GitHub-side details; the guide's troubleshooting section covers the likely ones.
- The DuckDNS updater was verified as configuration only: there is no real token here.
- **A deploy has a 10–20 s gap:** there is a single instance and the container is recreated. There is no automatic rollback; see `APP_IMAGE` in the guide.

Engineering:
- Daily provider quotas are in-memory counters; a restart resets them (a provider 429 then falls back to the next provider).
- **Job locks and the test-email rate limit are in memory**: correct for the single VM instance, not for several instances.
- **A digest missed because the server was down at 12:00 is not sent later.** Only `calendar-refresh` catches up at startup. Trigger `earnings-digest` manually; it is idempotent per user and day.
- **Jobs and requests share Finnhub's rate limiter.** While `calendar-refresh` enriches profiles (up to 1,500 calls, about 28 min from 06:00), Finnhub-backed requests wait up to 30 s for a permit and then fall back to Yahoo.
- **Firestore budget:** the first `calendar-refresh` into an empty database measured 7.3k reads and 3.6k writes. Later runs write only changed events, days and new profiles. While the process keeps running they read mostly from the in-memory cache; after a restart the next run reads from Firestore again (about 7k reads). Both stay well under the free 50k reads and 20k writes per day.
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
- **2026-09-27 — Stock overview degrades instead of failing:** profile and quote are required, while price history and earnings are optional (their fields become null if unavailable without a cached copy). Components are fetched in parallel on virtual threads.
- **2026-09-27 — Earnings history accumulates:** `earnings/{symbol}` stores the merged reports (up to 32) with their source. Each refresh merges fresh provider data into it (stored records rank by their original source), so quarters that fall out of a provider's window, such as Finnhub's one-month calendar, are kept. Jobs add observed calendar entries through `record()` without marking the history fresh.
- **2026-09-27 — Price freshness follows the market:** `prices/{symbol}` is stale only when a completed, settled session (close + 30 min, weekdays) is missing and the last fetch is over 30 minutes old, so weekends and nights cost no provider calls.
- **2026-09-27 — Followed earnings never call providers on the request path:** stored data only; symbols never loaded are fetched in the background (deduplicated) and show under `noUpcomingDate` meanwhile.
- **2026-09-27 — New internal capability `LISTINGS`** (batch name/exchange lookup; Yahoo first for proper names, Finnhub directory as US fallback). Peers resolve in one call instead of 8 profile fetches.
- **2026-09-27 — Search** asks the US and EU chains in parallel and interleaves the results after exact symbol matches, so neither region crowds out the other. Cached 10 min per query.
- **2026-09-27 — Calendar span:** "max 42 days" is read as inclusive (`to − from + 1 ≤ 42`); documented in the contract's implementation notes.
- **2026-09-27 — Finnhub's EPS surprises are a separate chain entry `finnhub-eps`, ranked after Yahoo.** The spec prefers "Finnhub *calendar* → FMP → Yahoo"; `/stock/earnings` is not the calendar and its actuals can disagree with FMP and Yahoo (AAPL: 1.91 vs 2.02). It still supplies fiscal quarters when nobody else has them. It shares Finnhub's rate limiter.
- **2026-09-27 — `earnings/{symbol}` stores raw per-provider rows**, one per provider per quarter (a newer row from the same provider replaces the older one; ≤ 24 per provider). The merged view is computed on every read. Storing merged records tagged with one source would have let FMP- or Yahoo-derived values outrank fresh FMP data forever.
- **2026-09-27 — Firebase emulator mode for local end-to-end tests:** when `FIREBASE_AUTH_EMULATOR_HOST` is set the backend starts without a key (project `demo-earnings-tracker` unless configured) and the Admin SDK uses the emulators. It is refused when `app.firebase.required=true` (prod), because emulator tokens are unsigned.
- **2026-09-27 — Admin job triggers are open to every allowlisted user** (two users, no roles). They return 202 at once and run in the background. Triggering a running job returns that run's `startedAt` instead of starting another.
- **2026-09-27 — Test email:**
  - It is sent before the endpoint answers, so SMTP problems surface as 503 instead of vanishing.
  - It looks 7 days ahead (the widest `notifyDaysBefore`), so real followed stocks show up more often than in a 1-day digest. With none, it falls back to sample data, marked as such.
  - Its subject starts with `[Test]`, and it is limited to 1 per minute per user (in memory).
- **2026-09-27 — Digest subject:** "Earnings tomorrow: …" when every listed report is tomorrow, otherwise "Upcoming earnings: …". §8's "if the range covers more than one day" is read as the reports' dates, so a 3-day window holding only tomorrow's reports still says "tomorrow". The subject lists at most 5 symbols, then "+N more".
- **2026-09-27 — Digest recipients are re-checked against the allowlist and `email_verified`** through Firebase Auth (`getUser`), because a `users/{uid}` document can outlive the user's access. The digest reads stored data only, so it makes no provider calls at 12:00. A followed symbol that was never loaded is fetched in the background for the next day.
- **2026-09-27 — Digest failures:**
  - `notificationLog` is written only after a successful send.
  - A failed send fails the run (recorded in `jobRuns.lastError`), and a rerun sends only the missing digests.
  - Without mail settings the job logs a warning and records `skipped`, so machines that never send mail don't log a failure every day.
- **2026-09-27 — `calendar-refresh` never wipes data during an outage:** days are rewritten only when their events change, empty days are not written, and dates whose US chunk failed keep their stored US events.
- **2026-09-27 — Mail configuration:** `spring.mail` maps `MAIL_USERNAME` and `MAIL_APP_PASSWORD`, with Gmail defaults: port 587, STARTTLS required, 10–15 s timeouts. `MAIL_HOST`, `MAIL_PORT`, `MAIL_SMTP_AUTH` and `MAIL_STARTTLS` exist only for local mail catchers. The Actuator mail health indicator is off, because it would open an SMTP connection on every health check.
- **2026-09-27 — `jobRuns.stats.firestoreReads` and `firestoreWrites`** come from the `DocumentStore` counters over the run, including both `jobRuns` updates. They count everything the process did meanwhile, concurrent requests included, so they are an estimate, which is what §6 asks for.
- **2026-09-27 — DuckDNS updater: the `linuxserver/duckdns` container instead of a cron job.** One `docker compose up -d` starts everything, the token stays in `.env`, the image is multi-arch, and it logs only "updated" or "something went wrong", never the token.
- **2026-09-27 — CI copies `deploy/` to the VM on every deploy.** The VM's only local state is `.env`, the service-account key and the certificate volume, so compose and Caddy changes ship through git like code. Pushes that touch `deploy/**` trigger the workflow.
- **2026-09-27 — The deploy job is gated by the repository variable `DEPLOY_ENABLED`.** The first push, before the VM exists, stays green and creates the GHCR package, which the guide then makes public.
- **2026-09-27 — The GHCR package is public:** free and unlimited, and the image contains no secrets. The private alternative is documented (`docker login` with a `read:packages` token).
- **2026-09-27 — Deploy safety:**
  - a dedicated CI key, and the host key pinned through `DEPLOY_KNOWN_HOSTS` (no trust on first use)
  - a health gate: the job fails and prints the log if the app is not healthy within 3 minutes
  - no automatic rollback: pin `APP_IMAGE` to a `sha-…` tag instead
- **2026-09-27 — Action versions are the current majors** (checked with the GitHub API on 2026-09-27): checkout v7, setup-java v6, upload-artifact v7, download-artifact v8, setup-buildx v4, login v4, metadata v6, build-push v7. Provenance and SBOM attestations are off, so each tag is one plain linux/arm64 image.
- **2026-09-27 — The verification checklist gets tokens from the Identity Toolkit REST API with Email/Password,** because the frontend doesn't exist yet. The Web API key goes in the `X-Goog-Api-Key` header, and the password is read from the terminal, never from arguments or history.
- **2026-09-26 — File locations.** `backend/Dockerfile`; `deploy/docker-compose.yml` and `deploy/Caddyfile` (the VM's `/opt/earnings-tracker` mirrors `deploy/` plus `.env` and the key).
