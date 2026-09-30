# Earnings Tracker

A personal, mobile-first web app (installable PWA) for two users that tracks US and European stocks: upcoming earnings dates, past results (EPS and revenue, estimate vs actual), price reactions around earnings, analyst recommendations and news, plus a daily email digest for followed stocks. Everything runs on free tiers.

- **App:** <https://tradiqo.web.app> (Angular on Firebase Hosting, once deployed per [DEPLOYMENT-frontend.md](docs/DEPLOYMENT-frontend.md))
- **API:** <https://tradiqo.duckdns.org/api/health> (Spring Boot on an Oracle Cloud Always Free VM)

## Repository layout

| Path | Contents |
|---|---|
| [`frontend/`](frontend/) | Angular 22 PWA (Material 3 + Tailwind, Firebase Auth + Firestore, Lightweight Charts), `firebase.json`, Firestore rules |
| [`backend/`](backend/) | Spring Boot API (Java 25, Spring Boot 4.1), packaged as a linux/arm64 Docker image |
| [`docs/`](docs/) | API contract, build prompts, progress logs, data-source notes, deployment guides |
| [`deploy/`](deploy/) | `docker-compose.yml` and `Caddyfile` for the Oracle Cloud VM |
| [`.github/workflows/`](.github/workflows/) | CI/CD: `backend.yml` (test, image, deploy to the VM), `frontend.yml` (lint, tests, rules tests, build, deploy to Hosting) |

## Architecture

```
Angular PWA (Firebase Hosting) ──HTTPS + Firebase ID token──▶ Caddy (TLS) ──▶ Spring Boot ──▶ Finnhub / Twelve Data / Yahoo / (FMP optional)
        │                                                                          │
        └──────── Firestore (user-owned docs only) ◀────── Admin SDK ───────────────┘ (cache + user data)
```

- **Auth:** Firebase Auth (Google and email/password with verification). The backend verifies ID tokens and only lets allowlisted, verified emails through; the Firestore rules enforce the same allowlist and per-user ownership.
- **Data:** the frontend writes follows, notes and settings directly to Firestore. The backend owns the cache collections and reads user data with the Admin SDK.
- **Hosting:** the app on Firebase Hosting (Spark plan); the API on an Oracle Cloud Always Free Ampere VM in Frankfurt, with Caddy (automatic HTTPS) and DuckDNS.

## Documentation

| Document | Purpose |
|---|---|
| [docs/CONTRACT.md](docs/CONTRACT.md) | API contract: the single source of truth between backend and frontend |
| [docs/DEPLOYMENT-frontend.md](docs/DEPLOYMENT-frontend.md) | Step-by-step frontend deployment (Firebase web app, rules, Hosting, GitHub Actions, installing on phones) |
| [docs/DEPLOYMENT-backend.md](docs/DEPLOYMENT-backend.md) | Step-by-step backend deployment (Firebase, Oracle VM, DuckDNS, CI/CD) |
| [docs/BACKEND-OPS-EXPLAINED.md](docs/BACKEND-OPS-EXPLAINED.md) | How the backend deployment works and how to operate it, explained for developers new to ops |
| [docs/PROGRESS-frontend.md](docs/PROGRESS-frontend.md) | Frontend build status, decisions and known issues. Resume from here. |
| [docs/PROGRESS-backend.md](docs/PROGRESS-backend.md) | Backend build status, decisions and known issues |
| [docs/PROMPT-frontend.md](docs/PROMPT-frontend.md), [docs/PROMPT-backend.md](docs/PROMPT-backend.md) | Full specifications |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | What each free data provider really returns |
| [frontend/README.md](frontend/README.md) | Frontend development: mock mode, emulators, tests |
| [backend/README.md](backend/README.md) | Backend development: local run, emulators, tests, configuration |
