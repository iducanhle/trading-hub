# Earnings Tracker backend

Spring Boot 4.1 API on Java 25 for the Earnings Tracker. Related docs:
- [docs/CONTRACT.md](../docs/CONTRACT.md): the API contract.
- [docs/DEPLOYMENT-backend.md](../docs/DEPLOYMENT-backend.md): running it on the Oracle VM.
- [docs/PROGRESS-backend.md](../docs/PROGRESS-backend.md): status, decisions and known issues.
- [docs/DATA-SOURCES.md](../docs/DATA-SOURCES.md): what each data provider returns.

## Requirements

- **JDK 25**, e.g. [Eclipse Temurin 25](https://adoptium.net/). Maven comes with the wrapper (`./mvnw`, or `mvnw.cmd` in PowerShell).
- Optional:
  - Docker, to build the image.
  - Node.js 20+, for the Firebase emulators (`npx firebase-tools`).
  - Git Bash on Windows, for the scripts in `scripts/`.

## Quick start

```bash
cd backend
cp .env.example .env          # fill in the API keys; FMP_API_KEY and the mail settings may stay empty
./mvnw spring-boot:run        # the "local" profile is the default and reads .env
curl http://localhost:8080/api/health        # {"status":"UP"}
```

`.env` is gitignored. Never put real values in `.env.example`.

Without Firebase settings, only `/api/health` works and every other call returns 401 (the startup log says so). There are two ways to get authenticated calls working locally:
- **Firebase emulators** (next section). No real project is needed, nothing leaves your machine, and it's the recommended option.
- **A real Firebase project:** save the service-account key as `backend/secrets/firebase-sa.json` (gitignored), then set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path and `FIREBASE_PROJECT_ID` in `.env`. Tokens then come from the frontend or from `scripts/firebase-token.sh`.

## End to end with the Firebase emulators

1. Terminal 1, start the Auth and Firestore emulators:
   ```bash
   cd backend/emulator
   npx -y firebase-tools@latest emulators:start --only auth,firestore --project demo-earnings-tracker
   ```
2. Terminal 2, start the backend against them:
   ```bash
   cd backend
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 \
   FIREBASE_PROJECT_ID=demo-earnings-tracker ALLOWED_EMAILS=dev@example.com JOBS_ENABLED=false \
   ./mvnw spring-boot:run
   ```
   In PowerShell, set the variables first, then start:
   ```powershell
   $env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'; $env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8085'
   $env:FIREBASE_PROJECT_ID='demo-earnings-tracker'; $env:ALLOWED_EMAILS='dev@example.com'; $env:JOBS_ENABLED='false'
   .\mvnw.cmd spring-boot:run
   ```
3. Terminal 3 (Git Bash), get a token for a verified emulator user and run the smoke test:
   ```bash
   cd backend
   export TOKEN=$(./scripts/emulator-token.sh)
   ./scripts/smoke.sh                 # health, then every main endpoint for AAPL and SAP.DE
   ```

Emulator tokens are not signature-checked, so emulator mode is refused under the `prod` profile.

## Jobs

The schedules (Europe/Prague) are `calendar-refresh` daily 06:00, `market-events-refresh` daily 06:30, `eu-universe-refresh` Sunday 03:00, `prices-refresh` daily 23:30 and `earnings-digest` daily 12:00. `calendar-refresh` also runs at startup when its last success is older than 24 h.

Locally, `JOBS_ENABLED=false` turns off the schedules and the startup run, because a first `calendar-refresh` makes up to 1,500 Finnhub profile calls and takes about 28 minutes. Trigger jobs by hand instead:
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/admin/jobs/calendar-refresh/run
```
The outcome is in the log (`Job calendar-refresh finished in N s: {…}`) and in Firestore `jobRuns/{jobName}`. To keep a first local run short, lower the profile budget with `APP_JOBS_MAXPROFILECALLSPERRUN=60`.

## Email

Locally, send mail to a catcher instead of Gmail, for example [Mailpit](https://mailpit.axllent.org/):
```bash
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
```
Start the backend with these variables, then call `POST /api/notifications/test` and open <http://localhost:8025>:
```
MAIL_HOST=127.0.0.1 MAIL_PORT=1025 MAIL_STARTTLS=false MAIL_SMTP_AUTH=false MAIL_USERNAME=dev@example.com MAIL_APP_PASSWORD=unused
```
`MAIL_USERNAME` and `MAIL_APP_PASSWORD` must be non-empty; the catcher ignores them. Real Gmail needs an app password (deployment guide, section 3).

The test email lists your followed stocks reporting in the next 7 days, or sample data. The digest job lists followed stocks reporting in `[today+1, today+notifyDaysBefore]`, and only sends when there is at least one. Follows and settings live in `users/{uid}`, which the frontend writes.

## Tests

```bash
./mvnw verify
```
This runs about 160 tests in about 2 minutes, with no network, Firebase or mail server:
- unit tests for the calculators and domain rules
- provider adapter tests against recorded JSON fixtures (MockWebServer)
- security tests (401/403, CORS)
- web tests (contract JSON, errors)
- job and digest tests (real SMTP into GreenMail)

**Live provider check** (real APIs, about 25 calls, keys from `.env`; providers without a key are skipped):
```bash
LIVE_PROVIDERS=true ./mvnw test -Dtest=LiveProvidersTest
```
Run it when a provider seems broken: Yahoo's endpoints are unofficial and can change.

## Docker image

```bash
cd backend
docker build -t earnings-tracker .                    # compiles inside Docker, for this machine's platform
./mvnw -q verify && docker buildx build --platform linux/arm64 --build-arg JAR_SOURCE=prebuilt -t earnings-tracker:arm64 .
```
The second form is what CI does: it reuses the tested jar and needs no emulation, because the arm64 stage only copies files. The image runs the `prod` profile, which requires the Firebase key (compose mounts it at `/run/secrets/firebase-sa.json`).

## Configuration

Profiles:
- `local` (the default) imports `.env` and logs `com.earningstracker` at DEBUG.
- `prod` (set in the Docker image) requires Firebase and refuses emulator mode.

Real environment variables always win over `.env`.

| Variable | Used for |
|---|---|
| `FINNHUB_API_KEY`, `TWELVEDATA_API_KEY`, `FMP_API_KEY` | Market data; a missing key disables that provider (with a warning), and requests fall back to the next provider (usually Yahoo) |
| `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` | Firebase Admin SDK (token checks, Firestore) |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to use the API (they must also be verified) |
| `CORS_ALLOWED_ORIGINS` | Frontend origins allowed to call `/api/**` |
| `MAIL_USERNAME`, `MAIL_APP_PASSWORD`, `MAIL_FROM_NAME` | Gmail SMTP sender for the digest |
| `APP_BASE_URL` | Frontend URL used in email links |
| `TZ` | Container time zone (`Europe/Prague`) |
| `JOBS_ENABLED` | `false` turns off the schedules and the startup run (local development) |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SMTP_AUTH`, `MAIL_STARTTLS` | Local mail catchers only; the defaults are Gmail's |
| `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` | Emulator mode (local only) |
| `DOMAIN`, `DUCKDNS_SUBDOMAIN`, `DUCKDNS_TOKEN`, `APP_IMAGE` | Docker Compose on the VM (not read by the app) |

Everything else (rate limits, provider chains, cache and job settings) is in `src/main/resources/application.yml`, with comments.

## API docs

Swagger UI: <http://localhost:8080/swagger-ui.html>. The UI itself is public; its **Authorize** button takes a Firebase ID token for the actual calls.

## Code layout

| Package | Contents |
|---|---|
| `config` | `.env` loader, OpenAPI, clock, virtual-thread executor |
| `firebase`, `security` | Admin SDK setup (incl. emulator mode), token filter, allowlist, CORS |
| `web` | Controllers, contract DTOs, the error format |
| `market` | Exchanges, symbols, money, the shared value records |
| `provider` | Capability interfaces, `ProviderRouter` (fallback chains), rate-limited HTTP, the Finnhub / Twelve Data / FMP / Yahoo adapters |
| `cache` | `TieredCache` (Caffeine in memory + Firestore documents) |
| `fx`, `universe` | USD exchange rates; the EU seed universe (`eu-universe.csv`) |
| `domain` | Calculators: performance, history, earnings results, price reactions, stats, the earnings merge |
| `service` | Composes providers, cache and calculators into the API responses |
| `jobs`, `notification` | Scheduled jobs, `jobRuns`, the digest email |
