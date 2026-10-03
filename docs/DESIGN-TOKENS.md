# Design tokens (redesign inspired by Trading 212)

Source of the design: the "Tradiqo Redesign" canvas (https://claude.ai/artifact/UhxKJhNwKd9EgEhPRTUsXr).
Navigation stays a burger menu (drawer) in the top-left corner; there is no bottom bar.

## Colors

| Token | Dark | Light | Usage |
|---|---|---|---|
| `bg` | `#04080C` | `#FFFFFF` | page background |
| `glow` | radial gradient, see below | – | blue glow at the top (dark only) |
| `card` | `#0E1A24` | `#F2F4F6` | cards, search field |
| `card2` | `#182733` | `#E6E9ED` | selected chip, cells inside cards, pills |
| `line` | `#1E2E3B` | `#E1E5E9` | dividers, borders, logo outline |
| `text` | `#F4F7FA` | `#0A0D12` | primary text |
| `muted` | `#8D9AA6` | `#5E6773` | labels, secondary text |
| `accent` | `#1AA6E4` | `#0272A8` | chart, countdown, today, star |
| `onAccent` | `#04131C` | `#FFFFFF` | text on accent |
| `up` | `#4ADE63` | `#0B7A22` | gain |
| `down` | `#FF5E5B` | `#C02F36` | loss |
| `upBg` | `rgba(74,222,99,.13)` | `rgba(11,122,34,.11)` | "NAD ODHADEM" badge background |
| `downBg` | `rgba(255,94,91,.14)` | `rgba(192,47,54,.11)` | high-impact event tile, negative day cell |
| `accentBg` | `rgba(26,166,228,.16)` | `rgba(2,114,168,.12)` | active drawer item, "Otevřená" pill, buy tile |
| `sheet` | `#0B151E` | `#FFFFFF` | bottom sheet background |
| `scrim` | `rgba(0,0,0,.62)` | `rgba(10,13,18,.38)` | overlay behind drawer and sheets |
| `amber` | `#E8B931` | `#E8B931` | analyst "Držet" segment |

Dark-mode glow (page background, scrolls away with content):

```css
background: radial-gradient(140% 42% at 85% -4%, #0E3B54 0%, #071520 40%, #04080C 72%), #04080C;
```

Charts:

- Line: `accent`, 2.2–2.4 px, round joins.
- Area fill: vertical gradient from `accent` at opacity 0.28 to 0.
- Net deposits line: `muted`, opacity 0.7, 1.2 px, `stroke-dasharray: 3 4`.
- Earnings markers: 20 px circle, `bg` fill, 2 px `accent` border, letter "E" 10 px / 800 in `accent`.

## Typography

Font **Onest**, weights 100–900, self-hosted from `@fontsource-variable/onest` (not Google Fonts: offline, no third-party request). All numbers use `font-variant-numeric: tabular-nums`.

| Role | Size / weight | Note |
|---|---|---|
| Hero value (account value, price) | 48–50 px / 300 | `letter-spacing: -.02em`; currency (`Kč`, `$`) 22 px / 700 |
| Page title | 22 px / 800 | UPPERCASE |
| Section heading | 20 px / 700 | |
| List row name | 16 px / 600 | |
| Label | 12 px / 700 | UPPERCASE, `letter-spacing: .05em`, `muted` |
| Secondary text | 12.5–14 px / 600 | `muted` |
| Chip / segmented button | 13 px / 700 | |

## Shape and spacing

- Radius: cards 22 px; logos 14 px (48 px tile), 18 px on stock detail (60 px tile); search field 14 px; cells 12–16 px; chips and pills 999 px.
- Page padding 20 px; cards inset 16 px from the edge; card padding 18 px.
- Gap between cards 14 px; space above a section heading 28–30 px.
- List row: 14 px vertical padding, 14 px gap between logo and text.
- Icon buttons 44×44 px; icons 24 px, stroke 1.6 px, round caps and joins (Lucide, `shared/icon`).
- No shadows: depth comes only from `card` / `card2`.

## Components

- **Top bar:** burger button (44 px) + page title in uppercase on the left; icon buttons (refresh, filters, settings) on the right. Detail pages use a back arrow instead of the burger.
- **Period selector:** borderless chips; selected = `card2` background + `text`, others `muted`.
- **Segmented control (Týden / Měsíc):** `card` track with 3 px padding, selected segment `card2`.
- **Tabs on stock detail:** 16 px / 600, active has a 3 px underline in `text`, inactive `muted`.
- **Key stats table:** card without fill, 1 px `line` border, label left / value right (16 px / 600).
- **Result badge:** `upBg` background, `up` text, 11.5 px / 800, uppercase, pill.
- **Price reaction cells:** 4-column grid, `card2`, radius 12 px, label 11 px uppercase `muted`, value 14 px / 700 colored by sign.
- **Net deposits pill:** `card2`, 9 px dot in `muted`, value 800 weight, label uppercase.
- **Drawer:** 308 px wide, `bg` (+ glow in dark), right corners 28 px, `scrim` over the page. Account value card on top; items 52 px high, radius 16 px, 16 px / 600; active item `accentBg` with `accent` icon. Settings and the signed-in user sit at the bottom.
- **Bottom sheet:** `sheet` background, top corners 28 px, 40×5 px handle in `card2`, title 22 px / 700. Footer: secondary (`card2`) and primary (`accent`) pill buttons side by side, 52 px high.
- **Filter options:** pill buttons 40 px high on `card2`; selected = `accent` + `onAccent` with a check icon.
- **Switch:** 52×32 px track; off = `card2` + `muted` knob, on = `accent` + `onAccent` knob.
- **Calendar month:** 5 weekday columns + 2 narrow weekend columns (32 px); cells 96 px, radius 12 px, `card`; today = `accent` circle on the number; selected day = 1.5 px `accent` border; logos as 18 px tiles, overflow as "+N".
- **Trade rows:** 40 px tile with an arrow; buy = `accentBg` + `accent`, sell = `card2` + `text`; realized P/L under the amount.
- **Calendar day strip:** 7 columns, radius 16 px; today = `accent` background with `onAccent` text; a 5 px dot marks days with reports.

## Mapping to Material 3 / Tailwind

Map tokens onto `--mat-sys-*` so Material components pick them up without restyling:

| Token | Material system token |
|---|---|
| `bg` | `surface` |
| `card` | `surface-container` |
| `card2` | `surface-container-high` |
| `text` | `on-surface` |
| `muted` | `on-surface-variant` |
| `accent` | `primary` |
| `onAccent` | `on-primary` |
| `line` | `outline-variant` |
| `accentBg` | `secondary-container`, `primary-container` |
| `down` / `downBg` | `error` / `error-container` |

Define each with `light-dark(<light>, <dark>)` (`mat.theme-overrides` in `frontend/src/material-theme.scss`). The rest are
custom properties in `frontend/src/styles.css`: `up` = `--app-gain`, `down` = `--app-loss`, `upBg` / `downBg` =
`--app-gain-container` / `--app-loss-container`, `--app-sheet`, `--app-scrim` and the analyst scale `--app-rec-*`. The glow
is the `app-glow` utility (dark theme only). Tailwind exposes the same colours (`bg-surface-container`, `text-gain`,
`bg-sheet`, `bg-scrim`, …).

## Accessibility notes

- `muted` on `card` is 6.1:1 (dark) and 5.2:1 (light); on `card2` 5.3:1 (dark) and 4.7:1 (light). All pass AA.
- The canvas's light `accent` (`#0B8FCB`), `up` (`#12932A`) and `down` (`#D63A3F`) failed AA (white on accent 3.6:1,
  up on card 3.6:1, down on card 4.2:1), so the light values above are darker: white on accent 5.3:1, up on card 5.0:1,
  down on card 5.2:1. Dark values pass as designed.
- Check layouts at 360 px in Czech; the longest labels (e.g. "Tržní kapitalizace") still fit on one line.
