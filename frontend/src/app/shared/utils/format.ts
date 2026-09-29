import { EarningsResult, ReportTime } from '../../core/models/contract';

/**
 * Numbers use en-US conventions whatever the device language: the UI is English, and en-US compact notation gives
 * the familiar `$8.4B` / `€312M` (en-GB would print `€312m` and `$8.4bn`).
 */
export const NUMBER_LOCALE = 'en-US';

/** What every missing value renders as. */
export const DASH = '—';

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(options);
  let format = formats.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      // Unknown currency code: fall back to a plain number.
      const { style: _style, currency: _currency, currencyDisplay: _display, ...rest } = options;
      format = new Intl.NumberFormat(locale, rest);
    }
    formats.set(key, format);
  }
  return format;
}

function isNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

/** A typographic minus reads better in tables and is announced as "minus" by screen readers. */
function withMinus(text: string): string {
  return text.replace('-', '−');
}

function currencyOptions(currency: string | null | undefined): Intl.NumberFormatOptions {
  return currency ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' } : {};
}

/** `$187.44`, `€45.10`; 2 decimals in the stock's currency. */
export function formatPrice(
  value: number | null | undefined,
  currency?: string | null,
  locale = NUMBER_LOCALE,
): string {
  if (!isNumber(value)) return DASH;
  const format = numberFormat(locale, {
    ...currencyOptions(currency),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withMinus(format.format(value));
}

/** A signed amount without a currency symbol, for day changes: `+2.31`, `−0.85`. */
export function formatSignedNumber(value: number | null | undefined, locale = NUMBER_LOCALE): string {
  if (!isNumber(value)) return DASH;
  const format = numberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });
  return withMinus(format.format(value));
}

/** Large amounts: `$8.4B`, `€312M`, `1.23T`; without a currency for counts such as volume (`52.3M`). */
export function formatCompact(
  value: number | null | undefined,
  currency?: string | null,
  locale = NUMBER_LOCALE,
): string {
  if (!isNumber(value)) return DASH;
  const format = numberFormat(locale, {
    ...currencyOptions(currency),
    notation: 'compact',
    maximumSignificantDigits: 3,
  });
  return withMinus(format.format(value));
}

/** Percent values as the API sends them (`3.25` = +3.25 %), always signed: `+3.20%`, `−1.05%`, `0.00%`. */
export function formatPercent(
  value: number | null | undefined,
  digits = 2,
  locale = NUMBER_LOCALE,
): string {
  if (!isNumber(value)) return DASH;
  const format = numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  });
  return withMinus(format.format(value)) + '%';
}

/** Unsigned percent, e.g. a beat rate: `75%`. */
export function formatPlainPercent(
  value: number | null | undefined,
  digits = 0,
  locale = NUMBER_LOCALE,
): string {
  if (!isNumber(value)) return DASH;
  const format = numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return format.format(value) + '%';
}

/** Plain numbers such as P/E: `28.41`. */
export function formatNumber(
  value: number | null | undefined,
  digits = 2,
  locale = NUMBER_LOCALE,
): string {
  if (!isNumber(value)) return DASH;
  const format = numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return withMinus(format.format(value));
}

export type Tone = 'gain' | 'loss' | 'flat';

/** Colour role of a change; the sign is always printed too, so meaning never relies on colour alone. */
export function toneOf(value: number | null | undefined): Tone {
  if (!isNumber(value) || value === 0) return 'flat';
  return value > 0 ? 'gain' : 'loss';
}

/** Tailwind text colour for a change. */
export function toneClass(value: number | null | undefined): string {
  switch (toneOf(value)) {
    case 'gain':
      return 'text-gain';
    case 'loss':
      return 'text-loss';
    default:
      return 'text-on-surface-variant';
  }
}

const REPORT_TIME_LABELS: Record<ReportTime, string> = {
  BMO: 'Before open',
  AMC: 'After close',
  DMH: 'During market',
  UNKNOWN: 'Time TBD',
};

export function reportTimeLabel(time: ReportTime | null | undefined): string {
  return REPORT_TIME_LABELS[time ?? 'UNKNOWN'];
}

const RESULT_LABELS: Record<EarningsResult, string> = { BEAT: 'Beat', MISS: 'Miss', INLINE: 'In line' };

export function resultLabel(result: EarningsResult | null | undefined): string {
  return result ? RESULT_LABELS[result] : DASH;
}

/** `Q3 FY2026`, or null when the source has no fiscal period. */
export function fiscalLabel(quarter: number | null, year: number | null): string | null {
  if (quarter == null || year == null) return null;
  return `Q${quarter} FY${year}`;
}
