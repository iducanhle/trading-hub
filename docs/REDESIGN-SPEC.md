# Redesign spec: headings, stat rows, modals

Implementation spec for the "Tradiqo Redesign v2" canvas (https://claude.ai/artifact/1Fi5s8sLxTosjoA4FEaVEB).
Read together with `DESIGN-TOKENS.md` (colours, radii, fonts stay as they are). Everything here is frontend only; no
contract or backend change.

## Goals and decisions

1. **One type scale.** Every heading uses one of five utilities. Hand-written `text-[..px] font-..` combinations for
   headings, labels, list rows and pills go away. Why: today 19 font sizes are in use, section headings on Followed,
   Portfolio and Settings look the same as field labels inside cards, and modal titles have three sizes.
2. **Stats are rows, never a two-column grid.** A label on the left, the value right-aligned on the right, one per
   line. A total is the last row, under a divider. Why: right-aligned figures in one column read like a statement, and
   long Czech labels ("Průměrná nákupní cena") and signed amounts don't wrap at 360 px.
3. **Every modal is a dialog in the middle of the screen**, on phones and on desktop. **The only exception is the term
   explanation (ⓘ)**, which is a bottom sheet on every screen size. Why: the owner chose this. One pattern, and the
   explanation is a light, transient aside, so it slides up instead of taking focus as a dialog does.

## 1. Typography utilities

Add to `frontend/src/styles.css` next to `app-label`. Sizes are px, as in `DESIGN-TOKENS.md`.

```css
/* Page title in the top bar. Section pages (burger) use the caps variant, pages with a back arrow the plain one. */
@utility app-title-page {
  font-size: 22px; font-weight: 800; letter-spacing: 0.01em; text-transform: uppercase; line-height: 1.2;
}
@utility app-title-page-back {
  font-size: 20px; font-weight: 700; line-height: 1.2;
}
/* Title of a dialog or the term sheet. */
@utility app-title-modal {
  font-size: 22px; font-weight: 700; line-height: 1.2;
}
/* Section heading on any page (stock detail, Followed groups, Portfolio, Settings). 28 px above it. */
@utility app-title-section {
  font-size: 20px; font-weight: 700; line-height: 1.3;
}
/* Title inside a card, a collapsible block, a sub-group inside a modal. */
@utility app-title-card {
  font-size: 15px; font-weight: 700; line-height: 1.4;
}
```

Change `app-label` to **12 px / 700** (it is 600 today) and remove every `text-[11px]` / `text-[11.5px]` override on it.
`app-label` is **only** an eyebrow above a value ("HODNOTA ÚČTU"). It is never a section heading and never a row label.

| Role | Utility | Size / weight | Where |
|---|---|---|---|
| Page title, section page | `app-title-page` | 22 / 800 caps | `page-header.ts` when `back()` is false |
| Page title, back page | `app-title-page-back` | 20 / 700 | `page-header.ts` when `back()` is true (today 18 / 700) |
| Modal title | `app-title-modal` | 22 / 700 | `app-dialog`, `app-sheet` |
| Section heading | `app-title-section` | 20 / 700 | headings that stand on the page, outside a card: `section.ts` (both branches), `key-stats.ts`, Followed groups, Search results, instrument page "Trades and dividends" |
| Card title | `app-title-card` | 15 / 700 | headings inside a card: Settings cards, Search "Recent", Portfolio "Asset allocation" / "Open positions", trade day groups; also the collapsible "Trades and dividends" in the position dialog, `history-calendar.ts`, `your-position.ts` card titles, report-time groups in the calendar day dialog, calendar month/week title |
| Eyebrow label | `app-label` | 12 / 700 caps, muted | above hero numbers and stats only |
| Empty-state title | `app-title-section` | 20 / 700 | `empty-state.ts` (today 18 / 600) |
| Auth card title | `app-title-modal` | 22 / 700 | `auth-card.ts` (today 24 / 600) |

Section headings with a count put the count after the text, in `text-[15px] font-semibold text-on-surface-variant`,
baseline-aligned: `Tento týden 3`, not `TENTO TÝDEN · 3`.

### List rows and pills

```css
/* Primary and secondary line of a list row (stocks, positions, trades, events). */
@utility app-row-title { font-size: 16px; font-weight: 600; line-height: 1.5; }
@utility app-row-meta  { font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--mat-sys-on-surface-variant); }
/* Small rounded badge: report time, region, result, "Incl. unrealized". Colour comes from a variant class. */
@utility app-pill {
  display: inline-flex; align-items: center; gap: 6px; border-radius: 999px;
  padding: 5px 11px; font-size: 12px; font-weight: 700; line-height: 1.2; white-space: nowrap;
}
```

- Row title replaces `text-[15px] font-medium` / `text-base font-bold` / `text-[15px] font-bold` in `stock-row.ts`,
  `followed-page.ts`, `timeline-list.ts`, `allocation-dialog.ts`, `day-sheet.ts`, `events-day-sheet.ts`,
  `portfolio-holdings.ts`, `portfolio-stocks.ts`. The meta line must never be heavier than the title.
- The right-hand value of a row stays `text-[15px] font-semibold`; the small line under it is `app-row-meta` (or
  coloured by sign).
- Logos in lists are **40 px** (radius 12), in modal / page headers **44 px**.
- `app-tag` (11 / 700 caps, padding 2 × 7 px) is the smaller sibling for a tag inside a row's meta line (position
  status Open / Closed, `region-badge`), so the line keeps its height.
- `app-pill` variants: accent (`bg-primary-container text-primary`), neutral (`bg-surface-container-high
  text-on-surface`), gain (`bg-gain-container text-gain`), loss (`bg-loss-container text-loss`). Replace the hand-made
  badges in `followed-page.ts:113`, `portfolio-stocks.ts:218/224`, `region-badge.ts`, `t212-settings.ts:52`,
  `upcoming-earnings.ts:37`, `position-summary.ts:94/100`. `result-badge` keeps its uppercase but takes the same size.

## 2. Stat rows: `app-stat-list` and `appStatRow`

New shared component in `shared/components/stat-list/`.

```html
<!-- In a card (card2 inside a modal, card on a page). -->
<dl appStatList card>
  <div appStatRow label="Unrealized" i18n-label term="unrealizedPnl">
    <app-pnl [value]="i.unrealizedPnl" [currency]="ccy" />
  </div>
  <div appStatRow label="Fees" i18n-label>…</div>
  <div appStatRow total label="Total" i18n-label>…</div>
</dl>

<!-- Plain, no card (secondary facts under the card). -->
<dl appStatList>
  <div appStatRow label="Shares held" i18n-label>{{ i.quantity | qty }}</div>
</dl>
```

Attribute selectors keep the HTML valid (`<dl>` may only contain `<div>`, `<dt>`, `<dd>`).

| Part | Spec |
|---|---|
| `dl[appStatList]` | `margin: 0`. With `card`: radius 22 px, padding 6 px 18 px, background `surface-container` on a page and `surface-container-high` inside a dialog (add `.mat-mdc-dialog-surface [appStatList][card]` to the existing "cards inside dialogs" rule at the end of `styles.css`). Without `card`: padding 0 4 px. |
| `div[appStatRow]` | `display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 9px 0`. |
| `dt` | 14 / 500, `on-surface-variant`, sentence case. With `term`, an `app-term-info` follows the text (gap 4 px). Wraps onto a second line if needed; never truncated. |
| `dd` | 15 / 600, `on-surface`, right-aligned, `white-space: nowrap`, tabular numbers. Signed amounts use `app-pnl` (colour by sign). |
| `total` | Divider `border-top: 1px solid outline-variant` with padding 11 px 0 9 px; `dt` 15 / 700 `on-surface`, `dd` 16 / 700. Always the last row of its list. |
| `sub` | A breakdown under the total ("Of which from the exchange rate"): padding-top 0, `dt` 13 / 500, `dd` 14 / 600. |

Use it everywhere stats are listed: `position-summary.ts` (replaces both grids), `trade-dialog.ts` (replaces the grid),
`unrealized-sheet.ts` (replaces the two `grid-cols-[1fr_auto]` lists), `key-stats.ts` (rows keep 16 / 600 values but
the labels become sentence case like everywhere else; the 52-week range stays a full-width row under the list),
the upcoming-earnings card (EPS estimate, revenue estimate).

## 3. Modals

### 3.1 `app-dialog`: the shell for every modal

New component `shared/components/dialog/dialog.ts`. It replaces `app-sheet` in all modals except the term sheet.

```html
<app-dialog [title]="t.name" [subtitle]="ticker + ' · ' + price">
  <app-stock-logo dialogLeading … [size]="44" />   <!-- optional, before the title -->
  <span dialogTrailing class="app-pill …">Sell</span>   <!-- optional, before the close button -->
  … body …
  <button matButton="tonal" dialogActions …>Whole position</button>
  <a matButton="filled" dialogActions …>Stock detail</a>
</app-dialog>
```

| Part | Spec |
|---|---|
| Surface | Material dialog, already themed: radius 28 px, `--app-sheet` background, no shadow, scrim backdrop. |
| Padding | 20 px on phones, 24 px from `lg` (64rem). |
| Header | Flex row, gap 12 px: leading slot, then title block (`app-title-modal`, subtitle `app-row-meta` below it), trailing slot, then a 44 × 44 close icon button (`close` icon, `aria-label="Close"`, margin `-6px -10px 0 0` so the icon aligns with the content edge). Title truncates on one line. |
| Linked header | When the header links to the stock page (position dialog), the leading logo and title block are one `<a>` with a chevron after the title; the close button stays outside the link. |
| Body | 16 px below the header. Scrolls inside the dialog when it is taller than the viewport; header and actions stay visible (sticky header and footer inside the scroll container, or a flex column with `overflow-y: auto` on the body). |
| Actions | Optional. 20 px above, buttons side by side, `flex: 1 1 0`, gap 10 px, height 52 px, pill shape. Secondary = `matButton="tonal"` (card2), primary = `matButton="filled"` (accent). One button takes the full width. No "Close" button in the actions: the ✕ closes. |

**Opening.** Add one helper so every dialog opens the same way, e.g. `shared/components/dialog/open-dialog.ts`:

```ts
export const DIALOG_CONFIG: MatDialogConfig = {
  width: 'calc(100vw - 32px)',
  maxWidth: '30rem',            // 480 px
  maxHeight: 'calc(100dvh - 32px)',
  autoFocus: 'dialog',
  restoreFocus: true,
};
```

Callers spread it: `this.dialog.open(TradeDialog, { ...DIALOG_CONFIG, data })`. Remove the per-call `width` /
`maxWidth: '32rem'` / `'28rem'` values that exist today.

### 3.2 `app-sheet`: only for the term explanation

- `TermSheet` (`shared/components/term-info/term-sheet.ts`) is always opened with `MatBottomSheet`. Delete the
  `matchMedia('(min-width: 64rem)')` branch in `term-info.ts` that opens it as a dialog.
- `app-sheet` keeps the handle (40 × 5 px), `app-title-modal`, the footer with one full-width 52 px button
  ("Got it" / "Rozumím"). Drop its `lg` dialog padding branch, since it is no longer used as a dialog.
- On desktop the bottom sheet is centred with `max-width: 560px` (panelClass on the open call, or a
  `mat.bottom-sheet-overrides` width if available).
- Title row: a 36 px round `primary-container` badge with the `info` icon, then the term name.

### 3.3 What changes where

| Modal | Today | After | Files |
|---|---|---|---|
| Position | `MatDialog`, own header, two grids | `app-dialog` with a linked header, stat rows (below), actions: one filled "Stock detail" (only when the symbol is known) | `position-dialog.ts`, `position-summary.ts`, all callers (`portfolio-allocation.ts`, `portfolio-cash.ts`, `portfolio-holdings.ts`, `portfolio-stocks.ts`, `trade-dialog.ts`, `your-position.ts`) |
| Trade | `MatDialog`, grid, small right-aligned buttons | `app-dialog`, side pill in the trailing slot, hero value, stat rows, actions: tonal "Whole position" + filled "Stock detail" | `trade-dialog.ts`, `portfolio-trades.ts` |
| All positions | `MatDialog`, 18 px title | `app-dialog`, title "All positions" with the count after it, list rows 16 / 600 + 13 / 500 | `allocation-dialog.ts` |
| Unrealized | Bottom sheet on phones, dialog on desktop | `app-dialog` everywhere, stat rows; no actions | `unrealized-sheet.ts` (rename to `unrealized-dialog.ts`), `your-position.ts` |
| Calendar day | Bottom sheet | `app-dialog`, title = long date, count after it; report-time groups as `app-title-card` | `day-sheet.ts` → `day-dialog.ts`, `calendar-page.ts` |
| Events day | Bottom sheet | `app-dialog`, as the calendar day | `events-day-sheet.ts` → `events-day-dialog.ts`, `events-page.ts` |
| Filters (calendar, events, stocks, trades) | Bottom sheet | `app-dialog`, actions: tonal "Reset" + filled "Done" | `filter-sheet.ts`, `events-filter-sheet.ts`, `stocks-filters.ts`, `trades-filters.ts`, their pages |
| Confirm | Bottom sheet | `app-dialog`, actions: tonal "Cancel" + filled (or `error` for destructive) confirm button. Keep the `confirm()` helper's signature so callers don't change | `confirm-sheet.ts` |
| Term (ⓘ) | Sheet on phones, dialog on desktop | **Bottom sheet everywhere** | `term-info.ts`, `term-sheet.ts` |

Renaming files is optional; if kept, update the class doc comments so they say "dialog".

### 3.4 Position dialog content (top to bottom)

1. Header: logo 44, name (linked, chevron), subtitle `TICKER · current price`, ✕.
2. Pills row (16 px below): period (`app-pill` neutral, "1. 1. – 4. 10. 2026" or "Celé období") and basis (`app-pill`
   accent "Incl. unrealized" or neutral "Realized only").
3. `app-label` "Total profit/loss" + `app-hero-amount size="md"` coloured by sign, with the percentage after it at
   16 / 600 (all time only, as today).
4. Stat list in a card: Unrealized (only with `includeUnrealized`), Realized, Dividends, Fees, **Total** (`total`).
   Order matters: it reads as a sum.
5. Plain stat list: Shares held, Value now, Average cost (term), Current price.
6. Collapsible "Trades and dividends · N" (`app-title-card`, divider above, 48 px min height), collapsed by default,
   content unchanged (segmented filter + `app-timeline-list`).
7. Actions: filled "Stock detail".

The instrument page (`instrument-page.ts`) uses the same `position-summary.ts`, so it gets the rows too; there the
card is `surface-container`.

### 3.5 Trade dialog content

1. Header: logo, name, subtitle `TICKER · executed at`, trailing `app-pill` with the side/kind (Buy accent, Sell
   neutral, other kinds neutral), ✕.
2. `app-label` "Value" + `app-hero-amount size="md"`.
3. Stat list in a card: Shares, Price per share, Exchange rate (only when not 1), Fees, then **Result** as `total`
   (only for a sell with `realizedPnl`, with the percentage).
4. Plain stat list: Order type.
5. Actions: tonal "Whole position" + filled "Stock detail" (only when the symbol is known; otherwise "Whole position"
   alone, full width).

## 4. Pages

- **Followed:** group headings `app-title-section` + count; rows `app-row-title` / `app-row-meta` (meta stays two lines:
  `SYMBOL · report time`, `EPS est. …`); the next-earnings card uses `app-hero-amount`-style text through a shared
  class instead of the hand-written 34 px span, `app-pill` for the report time.
- **Stock detail:** `app-section` headings 20 / 700; key stats as stat rows.
- **Portfolio:** sections that have a visible heading use `app-title-section`; the eyebrow labels in the overview stay
  `app-label`; the net-deposit and unrealized pills use `app-label` at its normal size (drop `text-[11.5px]`).
- **Settings, Search:** card headings change from `app-label` to `app-title-card`; the Search results heading outside
  the cards is `app-title-section` with the count after it.

## 5. States

| Element | State | Behaviour |
|---|---|---|
| Dialog | Loading | Header shows as soon as the name is known; body shows skeletons the size of the stat card (h-56) and the plain list (h-40). Without a name yet, a skeleton title bar (h-12). |
| Dialog | Error | `app-error-state` in the body with Retry; header and ✕ stay. |
| Dialog | Stale data | `app-stale-chip` under the header, before the pills. |
| Stat row | Missing value | `—` in the `dd` (never hide a row whose value is unknown; hide only rows that don't apply, e.g. exchange rate = 1). |
| Row / link | Hover | `bg-surface-container-high` inside dialogs, `bg-surface-container` on pages (as today). |
| Close ✕, action buttons | Focus | The global 2 px `primary` focus ring. |
| Collapsible | Expanded | Chevron rotates 180°, `aria-expanded="true"`. |
| Filter dialog | No changes | "Reset" disabled. |
| Day dialog | Empty | "No reports on this day." in `app-row-meta`, 24 px vertical padding. |

## 6. Responsive

| Width | Behaviour |
|---|---|
| < 64rem | Dialog `calc(100vw - 32px)` wide, max height `100dvh - 32px`, body scrolls. Term sheet full width from the bottom. |
| ≥ 64rem | Dialog 480 px wide, centred. Term sheet centred at the bottom, max 560 px. |
| 360 px, Czech | Labels may wrap to two lines in a stat row; values never wrap. Modal title truncates with an ellipsis. Check: "Cena oproti ceně bez ztráty", "Průměrná nákupní cena", "Z toho směnným kurzem". |

## 7. Motion

| Element | Trigger | Animation |
|---|---|---|
| Dialog | Open / close | Material default (fade + scale), no custom animation. |
| Term sheet | Open / close | Material bottom-sheet slide. Swipe-down / backdrop tap closes. |
| Collapsible chevron | Toggle | `transition-transform duration-200`. |

All of it already respects "reduce motion" through the global rule in `styles.css`.

## 8. Accessibility

- Dialogs: `app-dialog` renders the title as an `h2` with the Material `mat-dialog-title` directive, which wires
  `aria-labelledby` on the dialog automatically. Focus starts on the dialog (`autoFocus: 'dialog'`) and returns to the
  trigger on close. Escape closes.
- Tab order: ✕ is the **last** focusable element of the header (after the stock link), then body, then actions.
- Stat lists are real `<dl>` / `<dt>` / `<dd>`; the `total` row needs no extra ARIA.
- Touch targets ≥ 44 px (✕ 44, actions 52, collapsible 48).
- Term sheet: `ariaLabel` = the term name.

## 9. i18n

New or changed English strings (each needs a Czech entry in `messages.cs.json`, and stale ids removed;
`npm run i18n:check` enforces it):

| English | Czech |
|---|---|
| Total (stat row) | Celkem |
| Price per share (trade row label; today "Price") | Cena za akcii |
| Value now (position; today "Value · as of now") | Hodnota nyní |
| Stock detail (action; today "Open stock detail") | Detail akcie |
| Got it (term sheet action) | Rozumím |
| All time (period pill) | Celé období |

Row labels in the unrealized dialog keep their current texts. Follow `GLOSSARY-cs.md` for any other term.

## 10. Implementation order

Each step is its own commit and leaves the app working.

1. `feat(frontend): heading, row and pill utilities`: add the utilities, switch `app-label` to 700, apply them to
   `page-header`, `section`, `key-stats`, `empty-state`, Followed, Portfolio, Settings, Search, and the list rows.
2. `feat(frontend): stat rows`: `appStatList` / `appStatRow`; use them in `position-summary`, `trade-dialog`,
   `unrealized-sheet`, `key-stats`, upcoming earnings.
3. `feat(frontend): one dialog shell`: `app-dialog` + `DIALOG_CONFIG`; move Position, Trade and All positions onto it.
4. `feat(frontend): every modal is a dialog`: Unrealized, both day views, the four filter views and Confirm move from
   `MatBottomSheet` to `MatDialog`; the term explanation becomes a bottom sheet on every width.
5. `docs: redesign spec done`: update `DESIGN-TOKENS.md` (typography table, label 12 / 700, modal rules, hero size 34 /
   40 px as in `app-hero-amount`), `PROGRESS-frontend.md` (Decisions: dialogs everywhere except term info).

Before each commit: `npm run lint`, `npm run i18n:check`, `npm run test:ci`, `npm run build`. Specs that open sheets
(`features.spec.ts`, `stock-detail.spec.ts` and others that inject `MatBottomSheet`) need their expectations moved
to `MatDialog`.

## Open decisions

- **Stock detail header.** The canvas shows a plain back-page title ("Apple", 20 / 700) with a Follow button instead
  of today's `SYMBOL · price` pill. Not confirmed yet; keep the pill until decided.
- **Filters as dialogs.** They follow the "everything is a dialog" rule. If they feel heavy on phones, they are the
  first candidate to go back to a bottom sheet.
