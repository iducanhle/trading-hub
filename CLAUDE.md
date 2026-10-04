# CLAUDE.md

Quick-start context for Claude. Read this first; open the long docs only for the area you're touching.

## What this is

**Earnings Tracker** ("Tradiqo"): a personal, mobile-first PWA for two allowlisted users. It tracks US and EU stocks
(earnings dates and results, price reactions, analysts, news), market events, a daily email digest, and each user's
read-only Trading 212 portfolio. Everything runs on free tiers. The owner is a frontend dev who is new to ops, so give
concrete, copy-paste steps for anything deployment-related.

- App: https://tradiqo.web.app (Angular, Firebase Hosting; Firebase project `tradiqo`)
- API: https://tradiqo.duckdns.org/api/health (Spring Boot, Oracle Cloud ARM VM, Docker Compose + Caddy + DuckDNS)

## Layout

| Path | What |
|---|---|
| `frontend/` | Angular 22 PWA: standalone, signals, **zoneless, OnPush**, Material 3 + Tailwind 4, modular Firebase SDK (no AngularFire), Lightweight Charts, Vitest |
| `frontend/src/app/core/` | `api/` (ApiService + response cache), `auth/`, `data/` (`UserDataGateway` → Firestore), `services/`, `models/contract.ts` (mirrors CONTRACT.md), `mocks/` |
| `frontend/src/app/features/` | auth, search, stock-detail, followed, calendar, market-events, portfolio (T212), settings |
| `frontend/src/assets/mocks/` | Contract-shaped fixtures for mock mode |
| `frontend/src/locale/messages.cs.json` | Czech translations |
| `backend/` | Spring Boot 4.1, Java 25, Maven wrapper. Package `com.earningstracker`: `provider` (Finnhub/Yahoo/Twelve Data/FMP/T212 adapters + `ProviderRouter` fallback chains), `domain` (calculators), `service`, `web`, `cache` (Caffeine + Firestore), `jobs`, `t212`, `security`, `firebase` |
| `deploy/` | `docker-compose.yml`, `Caddyfile` (copied to the VM's `/opt/earnings-tracker` on each deploy) |
| `docs/` | See "Docs map" below |

## Commands

Frontend (run in `frontend/`, Node 24):
- `npm run start:mock`: no backend, no Firebase, fake user, fixtures. **Default for UI work.** Symbols starting `ERR` → 503, unknown → 404. T212 mock: any key connects (`bad` rejected, `noperm` lacks permissions).
- `npm run start:remote`: local UI against the **production** backend (real data; port 4200 only).
- `npm run lint` · `npm run i18n:check` · `npm run test:ci` · `npm run test:rules` (needs Java 21+) · `npm run build`
- These five are exactly what CI runs; run lint, i18n:check, test:ci and build before calling frontend work done.
- Preview servers in `.claude/launch.json`: `frontend-mock` (4200), `frontend-emulators` (4201), `frontend-prod` (4300, serves `dist/`), `frontend-mock-4210`.

Backend (run in `backend/`; `./mvnw` in Bash, `mvnw.cmd` in PowerShell):
- `./mvnw spring-boot:run` (profile `local`, reads `backend/.env`; set `JOBS_ENABLED=false` locally)
- `./mvnw verify`: about 160 tests, no network, about 2 min
- `LIVE_PROVIDERS=true ./mvnw test -Dtest=LiveProvidersTest`: real provider check when one seems broken

## Conventions that bite

- **Contract first.** `docs/CONTRACT.md` is the single source of truth between frontend and backend. Change it (with a
  changelog entry) together with `frontend/src/app/core/models/contract.ts` and the backend DTOs in `web/`.
- **Every user-visible string is translated.** Templates use `i18n="meaning|description"` and code uses
  `` $localize`:description:Text` ``. Add the Czech entry to `messages.cs.json` and follow `docs/GLOSSARY-cs.md` for
  terms. When English text changes, its id changes: translate the new id and delete the stale one. `npm run
  i18n:check` enforces this. Czech is the longest language, so check layouts at 360 px in Czech.
- **Never invent data.** Missing values are `null` from the API and `—` in the UI (known gaps: EU revenue estimates,
  unknown report times, small-cap estimates; see DATA-SOURCES.md).
- Frontend: `resource`/`rxResource`/`httpResource` are fine (stable in v22). Use reactive forms (not Signal Forms).
  Icons are inline Lucide SVG paths in `shared/icon/icon-paths.ts` (`npm run generate:icons`), not an icon font. Firestore
  and the Material snack bar load lazily, so don't import them eagerly. `inject()` goes before the first `await` in guards.
- Design: `docs/DESIGN-TOKENS.md` (redesign in progress, see PROGRESS-frontend). Material is themed only through tokens and
  `mat.*-overrides` in `material-theme.scss`; Tailwind is for layout around it, not for restyling Material components.
  Theme = `light-dark()` tokens (`--mat-sys-*`, `--app-*`). Font Poppins with Geist digits (`App Numerals`, self-hosted), no shadows. Single-choice
  controls are `app-segmented` (not `mat-button-toggle`); bottom-sheet content goes in `app-sheet`; labels and cards use
  the `app-label` / `app-card` utilities; big figures use `app-hero-amount`.
- Backend: provider API keys go only in headers, never in URLs or exception messages. A Finnhub `403` means "try the
  next provider", not "not found". Request paths for followed stocks never call providers (stored data only).
- New mock data must match the contract shape. Mock dates shift by whole weeks to the current week at runtime.
- The `.gitattributes` file forces LF (the machine has `core.autocrlf=true`), so keep `mvnw` and `*.sh` LF.

## Git and deploy

- Commit straight to `main`; **don't push unless asked**. A push to `main` runs CI and **auto-deploys** both the
  backend (VM) and the frontend (Hosting).
- Commit style: Conventional Commits with scope, e.g. `feat(frontend): …`, `fix(t212): …`, `docs: …`.
- Firestore rules are deployed by hand: `npm run deploy:rules -- a@x.com,b@y.com`. The committed rules keep
  placeholder emails because the repo is public. The allowlist must match `ALLOWED_EMAILS` on the VM.
- Never commit secrets: `backend/.env`, `backend/secrets/`, and the service-account key stay out of git.

## Docs map: read only what you need

| Task | Read |
|---|---|
| Current state, decisions, known issues | `docs/PROGRESS-frontend.md` / `docs/PROGRESS-backend.md` (the **Decisions** and **Known issues** sections; update these after finishing a feature) |
| Redesign: headings, stat rows, modals (implementation spec) | `docs/REDESIGN-SPEC.md` |
| API shapes and error codes | `docs/CONTRACT.md` |
| Provider quirks and data gaps | `docs/DATA-SOURCES.md` |
| Original specs | `docs/PROMPT-frontend.md`, `docs/PROMPT-backend.md`, `docs/PROMPT-trading212.md` |
| Deploying / ops / VM | `docs/DEPLOYMENT-*.md`, `docs/BACKEND-OPS-EXPLAINED.md` |
| Czech terminology | `docs/GLOSSARY-cs.md` |

## Environment

Windows 11 with PowerShell 5.1 (no `&&`, so use `;` or `if ($?)`) and Git Bash. Prefer Bash for POSIX scripts
(`backend/scripts/*.sh`).
