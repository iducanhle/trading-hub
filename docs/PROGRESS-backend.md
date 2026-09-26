# Backend progress

**How to resume:** the spec is [PROMPT-backend.md](PROMPT-backend.md) (phases in §14), the API contract is [CONTRACT.md](CONTRACT.md), and this file is the current state. Continue from **In progress**, then **Next**. Update this file after every completed item.

## Phase status

| Phase | Status |
|---|---|
| 0 – Setup | In progress |
| 1 – Skeleton | Not started |
| 2 – Providers | Not started |
| 3 – Domain + REST | Not started |
| 4 – Jobs + email | Not started |
| 5 – Deployment | Not started |

## Done

- Saved the prompt verbatim to `docs/PROMPT-backend.md`.
- Monorepo skeleton: `backend/`, `frontend/` (placeholder README), `docs/`, `deploy/`, `.github/workflows/`. Root `.gitignore` (secrets, Maven, Node/Angular, Firebase CLI, IDE), `.gitattributes` (LF), `backend/.env.example` (placeholders only).
- `docs/CONTRACT.md`: §10 verbatim (checked with `diff`), plus a title, a note on where it came from, and a changelog table for future API changes.

## In progress

Phase 0 – Setup:
- [x] Save the prompt
- [x] Monorepo skeleton, `.gitignore`, `.gitattributes`, `backend/.env.example`
- [x] `docs/CONTRACT.md`
- [ ] Root `README.md`

## Next

Phase 1 – Skeleton (see §14).

## Known issues

- None yet.

## Decisions

- **2026-09-26 — Commits go straight to `main`, not pushed.** Solo repo; the Phase 5 CI workflow triggers on pushes to `main`. Pushing is left to the owner.
- **2026-09-26 — `.gitattributes` forces LF line endings.** This machine has `core.autocrlf=true`, which would check out `mvnw` and `*.sh` with CRLF and break them inside Linux containers built from the Windows working tree. `*.cmd`/`*.bat` stay CRLF.
- **2026-09-26 — Root `.gitignore` rewritten for the monorepo.** Patterns are unanchored so they apply in `backend/` and `frontend/`. Lockfiles are no longer ignored, because `npm ci` in CI needs `frontend/package-lock.json`. Service-account keys are covered by `secrets/`, `*firebase-sa*.json`, `*-firebase-adminsdk-*.json` and similar patterns.
- **2026-09-26 — `.env.example` differs slightly from §11 in form, not content.** Comments are on their own lines, because some dotenv parsers keep inline comments as the value (an empty `FMP_API_KEY` would read as `# optional` and look set). `MAIL_FROM_NAME` is quoted so the file stays shell-sourceable. Same keys and placeholders as §11.
- **2026-09-26 — File locations.** `backend/Dockerfile`; `deploy/docker-compose.yml` and `deploy/Caddyfile` (the VM's `/opt/earnings-tracker` mirrors `deploy/` plus `.env` and the key).
