# Backend progress

**How to resume:** the spec is [PROMPT-backend.md](PROMPT-backend.md) (phases in §14), the API contract is [CONTRACT.md](CONTRACT.md), and this file is the current state. Continue from **In progress**, then **Next**. Update this file after every completed item.

## Phase status

| Phase | Status |
|---|---|
| 0 – Setup | Done |
| 1 – Skeleton | In progress |
| 2 – Providers | Not started |
| 3 – Domain + REST | Not started |
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

## In progress

Phase 1 – Skeleton (done when `./mvnw verify` passes and `docker build` works):
- [x] Scaffold `backend/`: Spring Boot 4.1.1, Java 25, Maven wrapper.
- [x] `application.yml` with `local` and `prod` profiles, typed config properties, `.env` loading for local runs.
- [ ] Firebase Admin SDK init (`FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`).
- [ ] Security filter: `Authorization: Bearer <ID token>` → `verifyIdToken`. Missing or invalid token → 401 `UNAUTHENTICATED`. Email not in `ALLOWED_EMAILS`, or `email_verified != true` → 403 `NOT_ALLOWED`. CORS from `CORS_ALLOWED_ORIGINS`.
- [ ] Global exception handler producing `{ code, message }` (CONTRACT "Errors").
- [ ] `GET /api/health` (public, `{ status: "UP" }`), `GET /api/me`, Actuator health only.
- [ ] `backend/Dockerfile` (multi-stage, runs on linux/arm64), `deploy/docker-compose.yml` + `deploy/Caddyfile`.
- [ ] Security tests: missing token → 401; not allowlisted → 403; unverified email → 403.

## Next

Later: Phase 2 providers + probe → `docs/DATA-SOURCES.md`; Phase 3 calculators + all endpoints; Phase 4 jobs + email; Phase 5 deployment docs + CI (see §14).

## Known issues

- **`backend/.env.example` has uncommitted local edits containing real API keys.** Never stage it (`git add` explicit paths only). The owner restores it with `git checkout -- backend/.env.example`; the keys are already in the gitignored `backend/.env`.

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
- **2026-09-26 — File locations.** `backend/Dockerfile`; `deploy/docker-compose.yml` and `deploy/Caddyfile` (the VM's `/opt/earnings-tracker` mirrors `deploy/` plus `.env` and the key).
