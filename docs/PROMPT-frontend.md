# Earnings Tracker — Prompt 2 of 2: Frontend (Angular)

You are building the frontend of **Earnings Tracker**, a personal, **mobile-first** web app (PWA) for tracking stocks (US + Europe), their earnings dates, past earnings results and price reactions around earnings. It has exactly **2 users**, and we use it on phones ~90% of the time. The Spring Boot backend already exists in `/backend` (built by prompt 1). Work autonomously in this repository, run commands to verify your work, and follow the phases in section 12.

---

## 0. Ground rules (read first)

1. **First action:** save this entire prompt verbatim to `docs/PROMPT-frontend.md`.
2. **Then read:**
   - **`docs/CONTRACT.md`**. It is **authoritative**: if it differs from the copy in section 9 of this prompt, the file wins, because the backend may have refined it.
   - `docs/PROGRESS-backend.md` (for Known issues and data gaps).
   - `docs/DEPLOYMENT-backend.md`.
3. Keep `docs/PROGRESS-frontend.md` up to date with these sections: **Done**, **In progress**, **Next**, **Known issues**, **Decisions**. Update it after every completed item so that any other model or session can resume from it.
4. **Git:** commit after every completed item using conventional commits. Never commit secrets. Firebase web config is not secret, but service-account keys are.
5. **Phases:** finish one phase, make sure `ng build` and the tests pass, commit, update PROGRESS, print a short summary (what was done, what I need to do, open questions), then **STOP and wait for me to reply "continue"**.
6. **Cost discipline:**
   - Don't re-read large files unnecessarily.
   - Keep mocks small.
   - Don't generate code you won't use.
   - If the same error persists after **2 fix attempts**, stop and report instead of looping.
7. If something is ambiguous but not blocking, choose the sensible option and log it under **Decisions**. Ask only when truly blocked.
8. **Do not change the backend or the contract.** If the contract is missing something, stop and tell me.
9. **Everything must stay free.** These are hard constraints:
   - Firebase **Spark** plan only.
   - No Firebase Cloud Storage.
   - No Cloud Functions.
   - No phone auth.
   - No paid libraries.
   - Keep Firestore reads low: use listeners only where needed (follows, settings) and no polling.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Framework | **Latest stable Angular** (check the version first). Standalone components, signals, the built-in control flow (`@if`/`@for`), zoneless change detection if it is the default for new projects, lazy-loaded routes. Use the `resource`/`httpResource` APIs where they are stable. |
| UI | **Angular Material (Material 3)** for interactive components (buttons, form fields, tabs, bottom sheets, dialogs, snackbars, menus, chips, button toggles) + **Tailwind CSS (latest)** for layout, spacing and typography. Configure them so Tailwind's preflight does not break Material. |
| Firebase | `@angular/fire` if it supports this Angular version; otherwise the modular Firebase JS SDK wrapped in injectable services. Auth + Firestore only. |
| Charts | **TradingView Lightweight Charts** (latest, open source): candlestick + line series and series markers. Keep its attribution enabled as its license requires. Lazy-load it on the detail page. |
| PWA | `@angular/pwa`: installable, with app icons (simple generated placeholder icon), theme colors, and an offline-capable shell. |
| Hosting | Firebase Hosting (SPA rewrite to `index.html`). |
| Tests | Unit tests for services, formatting utils and guards. Keep them lean. |

---

## 2. Mobile-first UX rules

- Design for a **390 px wide viewport first**, then enhance for tablet and desktop with Tailwind breakpoints. On desktop, content is centered with a sensible max width.
- **Bottom tab bar** on mobile: **Search · Followed · Calendar · Settings**. On desktop (≥ `lg`), switch to a left navigation rail or a top bar.
- Respect the iOS/Android **safe-area insets** (`env(safe-area-inset-*)`), especially for the bottom bar.
- Tap targets are **at least 44 px**. Support pull-to-refresh on the list pages (Followed, Calendar, Stock detail).
- **Loading:** skeleton placeholders, not spinners, for the main content. **Errors:** inline error state with a Retry button. **Empty states:** friendly text plus an action.
- If a response has `stale: true`, show a subtle "Data may be outdated" chip with the `asOf` time.
- **Number formatting** (one shared utility plus pipes):
  - Prices with 2 decimals and the stock's currency symbol.
  - Large numbers compact (`$8.4B`, `€312M`).
  - Percentages with a sign (`+3.20%`), colored green or red, with the sign always shown so meaning does not rely on color alone.
  - `null` renders as `—`.
- **Report time labels:**
  - `BMO` → "Before open"
  - `AMC` → "After close"
  - `DMH` → "During market"
  - `UNKNOWN` → "Time TBD"
  - `timeAssumed` → small "assumed" hint
- **Dates** use the device locale, with relative countdowns where useful ("in 3 days", "Tomorrow", "Today").
- **Logos:** show `logoUrl`. If it is null or fails to load, render a circle with the ticker's initials and a deterministic color. One reusable `StockLogo` component.
- **Accessibility:** semantic HTML, labels on icon buttons, focus states, sufficient contrast in both themes.
- **UI language:** English.

---

## 3. Theming

- **3-way toggle: Light / Dark / System** (Material button toggle group in Settings).
- Store the choice in `localStorage` for instant, flash-free loading via a tiny inline script in `index.html` that sets the class before Angular boots. Also sync it to Firestore `users/{uid}.settings.theme`.
- A `ThemeService` resolves `system` via `matchMedia('(prefers-color-scheme: dark)')` and listens for changes. It applies a `.dark` class on `<html>` and sets `color-scheme` so that the Material 3 theme and Tailwind's dark variant (a class-based custom variant) always agree.
- The chart colors and the PWA `theme-color` meta tag update when the theme changes.
- Aim for a clean, modern finance-app look: neutral surfaces, one accent color, green/red for gains/losses tuned for both themes.

---

## 4. Auth

- **Pages:**
  - **Login:** Google button, plus email + password, plus a "Forgot password" link.
  - **Register:** email + password + confirm.
  - **Reset password.**
- **Google sign-in:** use a popup on desktop and a **redirect on mobile / installed PWA**. Follow Firebase's current best practices for `signInWithRedirect` on browsers that partition third-party storage. The app is served from Firebase Hosting, so set `authDomain` to the hosting domain the app is served from, and document this.
- **Email/password:** after registration, send a **verification email** and show a "Verify your email" screen with Resend and "I've verified" (reload the user) buttons. Unverified users cannot use the app, because the backend and the rules require `email_verified`.
- **Guards:**
  - `authGuard` redirects to `/login`.
  - `allowedGuard` calls `GET /api/me` once per session and caches the result.
  - A 403 `NOT_ALLOWED` response shows a friendly "This app is private — access not granted" page with a Sign-out button.
- **User document:** on first login, create `users/{uid}` with the default settings from the contract, if it doesn't exist.
- **HTTP interceptor:**
  - Attaches `Authorization: Bearer <ID token>` (refreshed automatically) to requests going to `environment.apiBaseUrl`.
  - Maps contract errors to typed errors.
  - On 401, retries once with a force-refreshed token, then signs out.

---

## 5. Pages & features

### Routes
- `/login`, `/register`, `/reset-password`, `/verify-email`, `/no-access`
- `/search`
- `/stock/:symbol` (deep-linkable; the email links here)
- `/followed` (**default route after login**)
- `/calendar`
- `/settings`
- `**` → Followed

### Search (`/search`)
- A full-screen search input, autofocused, debounced 300 ms, calling `GET /api/search`.
- **Result row:** logo, symbol, name, exchange, and a small region badge (US / EU).
- **Recent searches:** the last 10 opened symbols, stored in `localStorage`, shown when the input is empty, and clearable.
- Tapping a row navigates to `/stock/:symbol`.

### Stock detail (`/stock/:symbol`)
Call `GET /api/stocks/{symbol}` for above-the-fold content. Load the other sections in parallel, and lazily as they scroll into view. Sections are stacked vertically; sections 5–13 are **collapsible**, with their expanded state remembered in `localStorage`.

1. **Sticky header:**
   - Back button, logo, symbol, name, price, day change (value + %).
   - **Follow / Following** toggle, which writes or deletes `users/{uid}/follows/{symbol}` with the contract fields. Update the UI optimistically and show a snackbar with Undo when unfollowing.
   - Below the sticky bar (scrolls away): exchange, currency, sector / industry.
2. **Key stats:** a compact 2-column grid with market cap, 52-week high/low (plus a small range bar showing the current price), P/E, EPS (TTM), average volume.
3. **Performance summary:** chips for 1W, 1M, YTD, 1Y (%).
4. **Chart:**
   - A Line / Candles toggle and range tabs **1W · 1M · 6M · 1Y · 5Y** (default 6M), using `GET …/prices`.
   - **Earnings markers** on the reaction-day bar:
     - Green for BEAT, red for MISS, grey for INLINE or unknown.
     - A hollow or outlined marker for UPCOMING events within the range.
   - Tapping a marker opens a small tooltip or bottom sheet: report date, time, EPS estimate vs actual, surprise %.
   - Touch crosshair showing date, OHLC (or close) and volume. Pinch/drag zoom within the loaded range.
   - Resizes with its container and follows theme changes.
5. **Performance history:**
   - Tabs **Daily / Weekly / Monthly**, swipeable, using `GET …/history`.
   - Compact rows, newest first:
     - **Daily:** "Fri 25 Sep".
     - **Weekly:** "22–26 Sep".
     - **Monthly:** "Sep 2026".
     - Each row shows the close and a colored %.
   - An **"E" badge** when `hasEarnings`, and a "partial" hint when `partial`.
   - "Load more" / infinite scroll via `nextBefore`.
6. **Upcoming earnings:** a card with the date, a relative countdown, the report time, fiscal quarter, EPS estimate and revenue estimate. If there is none, show "No upcoming date announced".
7. **Earnings history** (`GET …/earnings`, up to 12 quarters):
   - **Mobile:** one card per quarter with the quarter label and date; EPS estimate → actual (surprise %); revenue estimate → actual (surprise %); a BEAT/MISS/INLINE badge.
   - **Desktop (≥ `md`):** a table with the same data.
8. **Earnings price reaction:** per quarter, run-up (5d), gap, reaction day, drift (5d), as colored %. On mobile, put this inside the quarter card from section 7 (one card with two parts). On desktop, add these as extra table columns or a separate table.
9. **Earnings stats:** beat rate (e.g. "6 of 8 quarters · 75%"), the current streak ("3× BEAT"), average absolute reaction ("±6.4%").
10. **Analyst recommendations:** a stacked horizontal bar per period (strong buy → strong sell) using simple CSS or SVG with no extra library, plus a legend. Hide the section if the data is empty.
11. **News:** a list of headlines with source, relative time and an optional thumbnail. Links open in a new tab. Hide the section if empty.
12. **Peers:** horizontally scrollable chips (logo + symbol) that navigate to that stock's page. Hide the section if empty.
13. **My notes:** a textarea bound to `users/{uid}/notes/{symbol}`, autosaved (debounced 1 s) with a "Saved" indicator. The notes are private to the user.

Also:
- Record the symbol in the recent searches list when the page opens.
- Handle 404 `SYMBOL_NOT_FOUND` with a friendly page.

### Followed (`/followed`)
- `GET /api/followed/earnings`. Also subscribe to the user's `follows` collection so the list updates when a stock is followed or unfollowed on another device.
- **Grouped list:** **This week · Next week · Later**, then **"No date announced"** (from `noUpcomingDate`).
- **Row:** logo, symbol, name, date + countdown, report time, EPS estimate. Tapping it opens the detail page.
- A row menu (or swipe) to unfollow, with Undo.
- **Empty state:** "You're not following any stocks yet" plus a button that goes to Search.

### Calendar (`/calendar`)
- **Views:** **Week** (the default on mobile) and **Month** (the default on desktop), switched with a toggle.
- **Navigation:**
  - Previous / next buttons plus swipe left/right.
  - A **Today** button.
  - A header showing the range ("22–28 Sep 2026" / "September 2026").
- **Filters:** a filter bottom sheet on mobile and an inline bar on desktop.
  - **Market cap** chips: All · >$300M · **>$2B (default)** · >$10B · >$200B. These map to `minMarketCapUsd`; "All" = 0.
  - **Region:** All / US / EU.
  - **Followed only** toggle.
  - Persist the filters in `localStorage`.
- **Week view:**
  - A vertical list of days (Mon–Fri; show Sat/Sun only if they have events).
  - Each day shows a header (day name, date, event count) and a wrapping grid of **clickable logos with the ticker below**, sorted by market cap.
  - Show at most 8, then a **"+N"** tile.
  - Tapping a logo opens the detail page. Tapping "+N" or the day header opens a **bottom sheet** listing all of that day's events (logo, symbol, name, report time, EPS estimate), grouped by report time.
  - Highlight today, and visually mark followed stocks with a small star or ring.
- **Month view:**
  - A compact month grid. Each cell shows the day number, up to 3 tiny logos and a "+N" count.
  - Tapping a day opens the same bottom sheet.
  - Weekends are narrower or dimmed.
- **Data:** fetch `GET /api/calendar` for the visible range (a month grid can span 42 days, the API's maximum). Cache the ranges you have already fetched in memory for the session and prefetch the adjacent range.

### Settings (`/settings`)
- **Account:** avatar or initials, email, provider, **Sign out**.
- **Appearance:** Light / Dark / System toggle.
- **Notifications** (all stored in `users/{uid}.settings`):
  - Enable / disable email digest.
  - "Notify me **N** days before" (1–7, default 1).
  - Notification email (optional, validated; empty = use the account email).
  - A note: "Sent daily at 12:00 (Prague time) when a followed stock reports within this window."
  - A **Send test email** button (`POST /api/notifications/test`) that shows a snackbar with the result.
- **About:** app version, data sources (Finnhub, Twelve Data, Yahoo Finance), the TradingView Lightweight Charts attribution, and a "Data may be delayed; not investment advice" disclaimer.

---

## 6. Data layer

- **Typed models:** one TypeScript model file that mirrors `docs/CONTRACT.md` exactly.
- **One `ApiService`** with a method per endpoint. It handles URL-encoding of symbols (e.g. `SAP.DE`, `BRK-B`).
- **Firestore services:** `FollowsService` (a signal of followed symbols; follow/unfollow), `NotesService`, `SettingsService` (user doc with defaults). Use typed converters.
- **Session cache:** a simple in-memory cache with a TTL for GET responses (overview 60 s, others 5 min), so navigating back and forth doesn't refetch.
- **Mock mode:** with `environment.useMocks = true`, an HTTP interceptor serves small JSON fixtures from `src/assets/mocks/` that match the contract (for `AAPL` and `SAP.DE`, a calendar week, the followed list). This allows UI work without the backend. Auth can be bypassed with a fake allowed user in mock mode.
- **Environments:**
  - `environment.ts`: local, `apiBaseUrl: 'http://localhost:8080'`.
  - `environment.prod.ts`: `apiBaseUrl: 'https://YOUR_SUBDOMAIN.duckdns.org'`.
  - Both have a `firebase: { apiKey: 'PLACEHOLDER', authDomain: 'PLACEHOLDER', projectId: 'PLACEHOLDER', appId: 'PLACEHOLDER', messagingSenderId: 'PLACEHOLDER' }` block, clearly marked for me to fill in.
- **PWA service worker:** cache the app shell. Configure a `dataGroups` entry for `GET /api/**` with the **freshness** strategy (network first, 5 s timeout, 1 day max age), so the last viewed data works offline. Show an offline banner when `navigator.onLine` is false.

---

## 7. Firestore security rules (`frontend/firestore.rules`) + config

- **Allowlist:** a function `allowed()` requires `request.auth != null`, `request.auth.token.email_verified == true`, and the email to be in a hard-coded list `['USER1_EMAIL', 'USER2_EMAIL']`. The placeholders are for me to replace, and must be documented.
- **User data:** `users/{uid}` and all of its subcollections are readable and writable only if `allowed() && request.auth.uid == uid`. Validate field types and shapes on write: settings enums, `notifyDaysBefore` between 1 and 7, notes text ≤ 10,000 chars.
- **Everything else** is denied.
- Add emulator-based rules tests if cheap. Otherwise document manual test cases.
- **Config files:**
  - `firebase.json`: Hosting pointing at the Angular browser output folder, SPA rewrites, long cache headers for hashed assets, `no-cache` for `index.html` and `ngsw.json`. Also Firestore rules and indexes.
  - `.firebaserc` with a project-id placeholder.
  - `firestore.indexes.json`.

---

## 8. Deployment (write `docs/DEPLOYMENT-frontend.md`)

Assume I have **never deployed anything**. Give click-by-click steps with the exact commands, what I should see after each step, and troubleshooting. Cover:

1. **Prerequisites:** Node LTS, the Angular CLI, `firebase-tools` (`npm i -g firebase-tools`), `firebase login`.
2. **Firebase web app:** in the Firebase console (same project as the backend), add a Web app, copy the config into both environment files, and set `authDomain` correctly for the redirect sign-in.
3. **Auth settings:**
   - Confirm the Google and Email/Password providers are enabled.
   - **Authorized domains:** `localhost`, `YOUR_PROJECT.web.app`, `YOUR_PROJECT.firebaseapp.com`.
   - Optionally customize the verification email template.
4. **Rules:** replace the email placeholders in `firestore.rules`, then run `firebase deploy --only firestore:rules,firestore:indexes`.
5. **Backend link:**
   - Set `apiBaseUrl` in `environment.prod.ts` to the DuckDNS HTTPS URL.
   - Make sure the backend's `CORS_ALLOWED_ORIGINS` and `APP_BASE_URL` contain the hosting URLs.
6. **Build & deploy:** `ng build` (production), `firebase deploy --only hosting`, and the resulting URL.
7. **CI/CD** (`.github/workflows/frontend.yml`, triggered on pushes to `main` that touch `frontend/**`):
   - Install, run tests, build.
   - Deploy with the official Firebase Hosting GitHub Action using a service-account secret.
   - Step-by-step instructions to create that secret (`firebase init hosting:github` or manually).
   - Optionally, preview channels on pull requests.
8. **Install as an app:**
   - iPhone: Safari → Share → Add to Home Screen.
   - Android: Chrome → Install app.
9. **Verification checklist:** Google login, email registration + verification, a non-allowlisted account sees No access, search, detail page for `AAPL` and `SAP.DE`, follow/unfollow, notes, calendar filters, theme toggle, test email, offline shell.
10. **Cost check:** how to confirm in the Firebase console that the project is on the **Spark** plan and within quotas.

Also update the root `README.md` with a project overview, repo layout, and links to both deployment guides.

---

## 9. Shared contract (copy — `docs/CONTRACT.md` is authoritative)

### Conventions
- Base path `/api`. JSON uses camelCase. Every endpoint except `GET /api/health` requires `Authorization: Bearer <Firebase ID token>`.
- **`symbol`** is the canonical Yahoo-style ticker, uppercase:
  - US: `AAPL`, `BRK-B`
  - Europe: `SAP.DE`, `ASML.AS`, `MC.PA`, `AZN.L`, `NESN.SW`, `CEZ.PR`
  - URL-encode it in paths.
- **`region`**: `"US" | "EU"`. EU means any supported European exchange, including UK, CH and the Nordics.
- **Dates:** `YYYY-MM-DD` is the trading date in the exchange's local time. **Timestamps:** ISO-8601 UTC.
- **Money:** prices, EPS and revenue are in the stock's `currency` (ISO 4217); LSE pence are normalized to GBP. `marketCapUsd` is converted to USD.
- **Percentages:** `3.25` means +3.25%.
- **`ReportTime`**: `"BMO"` (before open), `"AMC"` (after close), `"DMH"` (during market hours), or `"UNKNOWN"`.
- **`EarningsResult`**: `"BEAT" | "MISS" | "INLINE"`.
- **Nulls:** any field may be `null` when no source has it. The UI renders `—`.
- **`asOf`** is when the data was fetched. **`stale: true`** means the upstream failed and cached data is being served.

### Errors
The HTTP status plus the body `{ "code": string, "message": string }`.

| Status | `code` |
|---|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `NOT_ALLOWED` (email not on the allowlist or not verified) |
| 404 | `SYMBOL_NOT_FOUND` |
| 429 | `RATE_LIMITED` |
| 503 | `UPSTREAM_UNAVAILABLE` (no cached data available) |

### Types
```ts
type Region = "US" | "EU";
type ReportTime = "BMO" | "AMC" | "DMH" | "UNKNOWN";
type EarningsResult = "BEAT" | "MISS" | "INLINE";

type SearchResult = {
  symbol: string; name: string; exchange: string; region: Region;
  currency: string; logoUrl: string | null;
};

type EarningsEvent = {
  symbol: string; name: string; exchange: string; region: Region; logoUrl: string | null;
  date: string; time: ReportTime;
  fiscalQuarter: number | null; fiscalYear: number | null;
  currency: string | null;
  epsEstimate: number | null; epsActual: number | null;
  revenueEstimate: number | null; revenueActual: number | null;
  marketCapUsd: number | null;
};

type EarningsStats = {
  quartersAnalyzed: number;
  beatRate: number | null;                       // percent
  streak: { result: "BEAT" | "MISS"; count: number } | null;
  avgAbsReactionPercent: number | null;
};

type StockOverview = {
  symbol: string; name: string; exchange: string; region: Region; currency: string;
  logoUrl: string | null; sector: string | null; industry: string | null; website: string | null;
  quote: { price: number; change: number; changePercent: number; previousClose: number; asOf: string };
  keyStats: {
    marketCap: number | null; marketCapUsd: number | null;
    week52High: number | null; week52Low: number | null;
    peRatio: number | null; epsTtm: number | null; avgVolume: number | null;
  };
  performance: { w1: number | null; m1: number | null; ytd: number | null; y1: number | null };
  nextEarnings: EarningsEvent | null;
  earningsStats: EarningsStats;
  asOf: string; stale: boolean;
};

type PriceBar = { date: string; open: number; high: number; low: number; close: number; volume: number };
type EarningsMarker = {
  date: string;                // reaction day (the bar where the move shows)
  reportDate: string; time: ReportTime;
  result: EarningsResult | "UPCOMING" | null;
  epsSurprisePercent: number | null;
};

type HistoryRow = {
  periodStart: string; periodEnd: string;
  close: number; changePercent: number | null; volume: number;
  hasEarnings: boolean; partial: boolean;
};

type EarningsReaction = {
  preRunUpPercent: number | null; gapPercent: number | null;
  reactionDayPercent: number | null; driftPercent: number | null;
};

type EarningsQuarter = {
  date: string; time: ReportTime; timeAssumed: boolean;
  fiscalQuarter: number | null; fiscalYear: number | null; currency: string | null;
  eps: { estimate: number | null; actual: number | null; surprisePercent: number | null };
  revenue: { estimate: number | null; actual: number | null; surprisePercent: number | null };
  result: EarningsResult | null;
  reaction: EarningsReaction | null;
};

type RecommendationPeriod = { period: string /* YYYY-MM */; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
type NewsItem = { headline: string; source: string; url: string; publishedAt: string; imageUrl: string | null; summary: string | null };
```

### Endpoints
| Method & path | Response | Notes |
|---|---|---|
| `GET /api/health` | `{ status: "UP" }` | Public |
| `GET /api/me` | `{ uid, email, allowed: true }` | 403 if not allowed |
| `GET /api/search?q=&limit=10` | `SearchResult[]` | `q` must be ≥1 char; max 20 results; US + EU equities only |
| `GET /api/stocks/{symbol}` | `StockOverview` | Used above the fold |
| `GET /api/stocks/{symbol}/prices?range=1W\|1M\|6M\|1Y\|5Y` | `{ symbol, currency, range, bars: PriceBar[] /* oldest first */, earningsMarkers: EarningsMarker[], asOf, stale }` | Daily bars; markers include upcoming events within the range |
| `GET /api/stocks/{symbol}/history?period=DAILY\|WEEKLY\|MONTHLY&before=YYYY-MM-DD&limit=30` | `{ period, rows: HistoryRow[] /* newest first */, nextBefore: string \| null }` | `limit` max 100 |
| `GET /api/stocks/{symbol}/earnings` | `{ upcoming: EarningsEvent \| null, quarters: EarningsQuarter[] /* newest first, max 12 */, stats: EarningsStats, asOf, stale }` | |
| `GET /api/stocks/{symbol}/recommendations` | `RecommendationPeriod[]` | Newest first, max 6; may be empty |
| `GET /api/stocks/{symbol}/news?limit=10` | `NewsItem[]` | May be empty |
| `GET /api/stocks/{symbol}/peers` | `SearchResult[]` | Max 8; may be empty |
| `GET /api/calendar?from=&to=&minMarketCapUsd=0&region=ALL\|US\|EU&followedOnly=false` | `{ from, to, days: { date: string, events: EarningsEvent[] }[] }` | Every date in the range is present (possibly empty). Events are sorted by `marketCapUsd` desc, nulls last. `minMarketCapUsd > 0` excludes unknown caps. Max span 42 days. |
| `GET /api/followed/earnings` | `{ upcoming: EarningsEvent[] /* date ≥ today, asc */, noUpcomingDate: SearchResult[] }` | Based on the caller's `users/{uid}/follows` |
| `POST /api/notifications/test` | `202 { sentTo: string }` | |
| `POST /api/admin/jobs/{jobName}/run` | `202 { jobName, startedAt }` | Backend admin only; not used by the UI |

### Firestore — user-owned documents (written by the frontend)
```
users/{uid}
  email: string, displayName: string | null, createdAt: timestamp,
  settings: {
    theme: "light" | "dark" | "system",          // default "system"
    notificationsEnabled: boolean,                // default true
    notifyDaysBefore: number,                     // 1–7, default 1
    notificationEmail: string | null              // null = use auth email
  }
users/{uid}/follows/{symbol}   { symbol, name, exchange, region, logoUrl, followedAt: timestamp }
users/{uid}/notes/{symbol}     { symbol, text, updatedAt: timestamp }
```
Backend-only collections (the rules must deny all client access): `symbols`, `prices`, `earnings`, `earningsCalendar`, `fx`, `jobRuns`, `notificationLog`, `viewed`.

---

## 10. Code quality

- **Folder structure:** `core/` (auth, api, interceptors, guards, services, models), `shared/` (components, pipes, utils), `features/` (search, stock-detail, followed, calendar, settings, auth). One component per file.
- Use `OnPush` or signals everywhere, strict TypeScript, and ESLint via `ng lint` if available.
- Break the stock detail page into small section components that each own their loading and error state.
- No `any` in the contract models.
- Keep the initial bundle lean: lazy routes, a lazy chart library, and Material imported per component.

---

## 11. Performance targets

- The first meaningful paint on a mid-range phone is quick. Use skeletons and avoid layout shift, with fixed chart and logo sizes.
- The detail page shows the header and key stats first; below-the-fold sections load as they come into view.

---

## 12. Phases (stop after each one)

| Phase | Scope | Done when |
|---|---|---|
| **0 – Setup** | Save the prompt, read the docs, create `docs/PROGRESS-frontend.md` | Committed |
| **1 – Foundation** | Scaffold Angular in `/frontend`, Tailwind + Material 3, theming (3-way + no flash), PWA, app shell with bottom tab bar / desktop nav + safe areas, routing, environments with placeholders, Firebase init, auth pages (Google popup/redirect, email/password, verification, reset), guards, interceptor, No-access page, user doc bootstrap, contract models, `ApiService`, mock mode + fixtures, shared formatting utils + `StockLogo` | `ng build` + tests pass; I can log in (or use mock mode) and navigate every tab |
| **2 – Search + Stock detail** | Search page, all 13 detail sections including the chart (line/candles, ranges, earnings markers, crosshair, theme-aware), performance history with pagination, earnings cards/table, notes, follow button | Works in mock mode and against the local backend |
| **3 – Followed + Calendar + Settings** | Followed page with live follows, Calendar week/month views with swipe, filters, bottom sheets, prefetch; Settings with theme, notifications, test email, about | All pages work in both themes at 390 px and desktop widths |
| **4 – Polish + deployment** | Skeletons, empty and error states, stale chip, offline banner, pull-to-refresh, accessibility pass, Firestore rules (+ tests or a manual checklist), `firebase.json`, GitHub Actions workflow, `docs/DEPLOYMENT-frontend.md`, root README | Production build passes; docs complete |

## Definition of done
- Every page and section above is implemented against `docs/CONTRACT.md`.
- It is mobile-first and polished at 390 px, and works on desktop.
- Light, dark and system themes work without a flash.
- The app is installable as a PWA.
- Mock mode works.
- There are no secrets in git.
- The Firestore rules enforce the allowlist and ownership.
- The PROGRESS file is complete.
- A person who has never deployed anything can follow `docs/DEPLOYMENT-frontend.md` end to end.
