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
- Firebase Admin SDK init (`FirebaseAppHolder`): optional locally (warns, auth disabled), required in `prod` (fails fast with an actionable message).
- Security: `FirebaseAuthenticationFilter` + `TokenVerifier` (wraps `verifyIdToken`), `EmailAllowlist` (case-insensitive), CORS for `/api/**` from `CORS_ALLOWED_ORIGINS`. `GET /api/health` and Swagger UI are public; everything else needs the `ALLOWED` authority.
- Error handling: `GlobalExceptionHandler` + `JsonErrorController` (`/error`) + `ApiErrorWriter` (security chain) all produce `{ code, message }`, including firewall rejections.
- `GET /api/health`, `GET /api/me`; Actuator exposes `health` only, behind auth. Swagger UI at `/swagger-ui.html` with a Firebase bearer "Authorize" button.
- `backend/Dockerfile` + `.dockerignore`, `deploy/docker-compose.yml` (app + Caddy, key mounted as a compose secret at `/run/secrets/firebase-sa.json`) and `deploy/Caddyfile`. Compose validated with `docker compose config`; the healthcheck command was tested against the running app (exit 0 when up, 1 when down).
- Tests (21, all green): security integration tests (401 missing/invalid token, 403 not allowlisted, 403 unverified, 200 `/api/me`, 404 format, CORS preflight allow/deny, public docs, protected actuator), allowlist, Firebase startup, `.env` parser.

## In progress

Phase 1 – Skeleton (done when `./mvnw verify` passes and `docker build` works):
- [x] Scaffold `backend/`: Spring Boot 4.1.1, Java 25, Maven wrapper.
- [x] `application.yml` with `local` and `prod` profiles, typed config properties, `.env` loading for local runs.
- [x] Firebase Admin SDK init (`FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`).
- [x] Security filter: `Authorization: Bearer <ID token>` → `verifyIdToken`. Missing or invalid token → 401 `UNAUTHENTICATED`. Email not in `ALLOWED_EMAILS`, or `email_verified != true` → 403 `NOT_ALLOWED`. CORS from `CORS_ALLOWED_ORIGINS`.
- [x] Global exception handler producing `{ code, message }` (CONTRACT "Errors").
- [x] `GET /api/health` (public, `{ status: "UP" }`), `GET /api/me`, Actuator health only.
- [x] `backend/Dockerfile` (multi-stage, runs on linux/arm64), `deploy/docker-compose.yml` + `deploy/Caddyfile`.
- [ ] **Verify `docker build`** (native and `--platform linux/arm64`), `docker run` + `/api/health`, and `caddy validate` on the Caddyfile. Blocked: Docker Desktop's engine cannot start until WSL is installed (see Known issues).
- [x] Security tests: missing token → 401; not allowlisted → 403; unverified email → 403.

## Next

Later: Phase 2 providers + probe → `docs/DATA-SOURCES.md`; Phase 3 calculators + all endpoints; Phase 4 jobs + email; Phase 5 deployment docs + CI (see §14).

## Known issues

- **Docker engine unavailable on the dev machine:** WSL is not installed, so Docker Desktop's Linux engine does not start (CLI calls return HTTP 500). Needs an admin `wsl --install` and a reboot by the owner. Until then the Docker build is unverified.
- **Tooling quirk (Windows):** `kill $!` from Git Bash may not stop a `java.exe` started in the background; stop it with PowerShell `Stop-Process -Id <pid>` (find it with `Get-NetTCPConnection -LocalPort 8080`).
- **`backend/.env.example` has uncommitted local edits containing real API keys.** Never stage it (`git add` explicit paths only). The owner restores it with `git checkout -- backend/.env.example`; the keys are already in the gitignored `backend/.env`.
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
- **2026-09-27 — `/api/health` is a liveness check that always says `UP` while the app serves requests.** Actuator exposes only `health`, and it needs a token (§9: `/api/health` is the only public endpoint). Wiring `/api/health` to Actuator's aggregate would make it depend on indicators such as SMTP once mail is added.
- **2026-09-27 — CORS** applies to `/api/**` only: methods GET/POST, headers `Authorization` and `Content-Type`, no credentials (bearer tokens, no cookies), preflight cached for 1 h.
- **2026-09-27 — Contract: added error codes `404 NOT_FOUND`, `405 METHOD_NOT_ALLOWED`, `500 INTERNAL_ERROR`** (see the changelog in `CONTRACT.md`), so every error response carries a documented code.
- **2026-09-27 — `UserDetailsServiceAutoConfiguration` excluded.** There is no username/password login, and it would log a generated password at startup.
- **2026-09-27 — Dockerfile: no emulation for arm64.** Build stages use `--platform=$BUILDPLATFORM` (the jar is platform-independent) and the final `eclipse-temurin:25-jre` stage has no `RUN` step, so `buildx --platform linux/arm64` on x86 needs no QEMU. `--build-arg JAR_SOURCE=prebuilt` makes CI reuse the jar that `./mvnw verify` already tested instead of compiling twice. Runs as uid 1000 (`ubuntu` in both the image and on the Oracle VM, so the `chmod 600` key stays readable). Spring Boot layered extraction for smaller updates.
- **2026-09-27 — Compose:** image `${APP_IMAGE:-ghcr.io/iducanhle/earnings-tracker-backend:latest}`; the service-account key is a compose secret mounted at `/run/secrets/firebase-sa.json`, and compose pins `GOOGLE_APPLICATION_CREDENTIALS` to that path whatever `.env` says. The healthcheck uses bash `/dev/tcp`, because the JRE image has neither curl nor wget (checked in Adoptium's Dockerfile). A missing `DOMAIN` fails fast.
- **2026-09-27 — Caddy proxies only `/api/*` and the Swagger/OpenAPI paths**; everything else (including `/actuator`) is 404 at the edge. HSTS on, `Server` header removed, TCP 80/443 only (no HTTP/3, so the Oracle security list needs no UDP rule).
- **2026-09-26 — File locations.** `backend/Dockerfile`; `deploy/docker-compose.yml` and `deploy/Caddyfile` (the VM's `/opt/earnings-tracker` mirrors `deploy/` plus `.env` and the key).
