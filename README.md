# Earnings Tracker

A personal web app for two users that tracks US and European stocks: upcoming earnings dates, past results (EPS and revenue, estimate vs actual), price reactions around earnings, analyst recommendations and news, plus a daily email digest for followed stocks. Everything runs on free tiers.

## Repository layout

| Path | Contents |
|---|---|
| [`backend/`](backend/) | Spring Boot API (Java 25, Spring Boot 4.1), packaged as a linux/arm64 Docker image |
| [`frontend/`](frontend/) | Angular app on Firebase Hosting (built by the second prompt) |
| [`docs/`](docs/) | Shared docs: API contract, build prompts, progress logs, data-source notes, deployment guides |
| [`deploy/`](deploy/) | `docker-compose.yml` and `Caddyfile` for the Oracle Cloud VM |
| [`.github/workflows/`](.github/workflows/) | CI/CD |

## Architecture

```
Angular (Firebase Hosting) ──HTTPS + Firebase ID token──▶ Caddy (TLS) ──▶ Spring Boot ──▶ Finnhub / Twelve Data / Yahoo / (FMP optional)
        │                                                                     │
        └──────── Firestore (user-owned docs only) ◀──── Admin SDK ────────────┘ (cache + user data)
```

- **Auth:** Firebase Auth (Google and email/password). The backend verifies ID tokens and only lets allowlisted, verified emails through.
- **Data:** the frontend writes follows, notes and settings directly to Firestore. The backend owns the cache collections and reads user data with the Admin SDK.
- **Hosting:** an Oracle Cloud Always Free Ampere VM in Frankfurt, with Caddy (automatic HTTPS) and DuckDNS. Firestore stays on the free Spark plan.

## Documentation

| Document | Purpose |
|---|---|
| [docs/CONTRACT.md](docs/CONTRACT.md) | API contract: the single source of truth for the frontend |
| [docs/PROGRESS-backend.md](docs/PROGRESS-backend.md) | Backend build status, decisions and known issues. Resume from here. |
| [docs/PROMPT-backend.md](docs/PROMPT-backend.md) | Full backend specification |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | What each free data provider really returns |
| [docs/DEPLOYMENT-backend.md](docs/DEPLOYMENT-backend.md) | Step-by-step deployment guide (Firebase, Oracle VM, DuckDNS, CI/CD) |
| [backend/README.md](backend/README.md) | Local development, tests, configuration |
