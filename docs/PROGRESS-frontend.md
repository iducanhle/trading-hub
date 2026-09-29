# Frontend progress

**How to resume:** the spec is [PROMPT-frontend.md](PROMPT-frontend.md) (phases in §12), the API contract is [CONTRACT.md](CONTRACT.md) (authoritative over the prompt's §9 copy), and this file is the current state. Continue from **In progress**, then **Next**. Update this file after every completed item.

## Phase status

| Phase | Status |
|---|---|
| 0 – Setup | Done |
| 1 – Foundation | Not started |
| 2 – Search + Stock detail | Not started |
| 3 – Followed + Calendar + Settings | Not started |
| 4 – Polish + deployment | Not started |

## Done

**Phase 0 – Setup**
- Saved the prompt verbatim to `docs/PROMPT-frontend.md` (byte-identical, checked with `cmp`).
- Read `docs/CONTRACT.md`, `docs/PROGRESS-backend.md` and `docs/DEPLOYMENT-backend.md`. Differences from the prompt's §9 copy that matter to the frontend:
  - Extra error codes: `404 NOT_FOUND` (unknown endpoint), `405 METHOD_NOT_ALLOWED`, `500 INTERNAL_ERROR`.
  - Implementation notes: symbols in paths are case-insensitive; `prices.range` defaults to `1Y`; the `UPCOMING` marker's `date` is its expected reaction day; `history.before` is exclusive and `nextBefore` is the last row's `periodStart`; calendar `from`/`to` are inclusive (≤ 42 days); followed stocks never loaded yet appear under `noUpcomingDate`; the test email is limited to 1 per minute (429) and returns 503 without mail settings.

## In progress

Nothing.

## Next

Phase 1 – Foundation (see §12 of the prompt).

## Known issues

From the backend (details in [PROGRESS-backend.md](PROGRESS-backend.md) and [DATA-SOURCES.md](DATA-SOURCES.md)); the UI must render these as `—`, never invent values:
- EU revenue estimates for past quarters are missing; EU revenue actuals exist only for the last 4 quarters.
- Report times are often `UNKNOWN` (about 70% of US calendar events); reactions then use the UNKNOWN rule with `timeAssumed = true`.
- Small caps often lack analyst estimates.
- EU peers: at most 5. EU news has no source name or image.
- `logoUrl` in search results is filled only for stocks whose profile is already cached.

## Decisions

- **2026-09-30 — The live values are known and used:** Firebase project `tradiqo`, backend `https://tradiqo.duckdns.org` (see PROGRESS-backend "Live deployment"). They go into `environment.prod.ts` and `.firebaserc` instead of `YOUR_SUBDOMAIN`/project placeholders. The Firebase web-app keys (`apiKey`, `appId`, `messagingSenderId`) do not exist until the web app is registered, so they stay `PLACEHOLDER`.
- **2026-09-30 — Commits go straight to `main`, not pushed** (same as the backend). Pushing is left to the owner, because a push to `main` triggers the deploy workflows.
