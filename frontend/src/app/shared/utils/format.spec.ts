import {
  DASH,
  fiscalLabel,
  formatCompact,
  formatNumber,
  formatPercent,
  formatPlainPercent,
  formatPrice,
  formatQuantity,
  formatSignedMoney,
  formatSignedNumber,
  reportTimeLabel,
  splitMoney,
  toneClass,
  toneOf,
} from './format';
import { resolveLocale } from './locale';
import { baseSymbol, symbolColor, symbolInitials } from './symbols';

const MINUS = '−';

describe('format', () => {
  it('renders missing values as a dash', () => {
    expect(formatPrice(null, 'USD')).toBe(DASH);
    expect(formatCompact(undefined)).toBe(DASH);
    expect(formatPercent(null)).toBe(DASH);
    expect(formatNumber(Number.NaN)).toBe(DASH);
    expect(formatSignedNumber(null)).toBe(DASH);
  });

  it('signs profit and loss amounts', () => {
    expect(formatSignedMoney(123.4, 'EUR', 'en-US')).toBe('+123.40 €');
    expect(formatSignedMoney(-12, 'USD', 'en-US')).toBe(MINUS + '12.00 $');
    expect(formatSignedMoney(0, 'EUR', 'en-US')).toBe('0.00 €');
    expect(formatSignedMoney(1.5, 'EUR', 'cs-CZ')).toBe('+1,50 €');
    expect(formatSignedMoney(null, 'EUR')).toBe(DASH);
  });

  it('shows fractional share quantities', () => {
    expect(formatQuantity(10, 'en-US')).toBe('10');
    expect(formatQuantity(0.5, 'en-US')).toBe('0.5');
    expect(formatQuantity(1.2345678, 'en-US')).toBe('1.234568');
    expect(formatQuantity(null)).toBe(DASH);
  });

  it('formats prices with 2 decimals and the currency symbol', () => {
    expect(formatPrice(187.4, 'USD', 'en-US')).toBe('187.40 $');
    expect(formatPrice(45.1, 'EUR', 'en-GB')).toBe('45.10 €');
    expect(formatPrice(12.3456, 'GBP', 'en-GB')).toBe('12.35 £');
    expect(formatPrice(-3, 'USD', 'en-US')).toBe(MINUS + '3.00 $');
  });

  it('falls back to a plain number for an unknown currency', () => {
    expect(formatPrice(5, 'NOT-A-CURRENCY', 'en-US')).toBe('5.00');
  });

  it('formats large numbers compactly', () => {
    expect(formatCompact(8.4e9, 'USD', 'en-US')).toBe('8.4B $');
    expect(formatCompact(312e6, 'EUR')).toBe('312M €');
    expect(formatCompact(1_234e9, 'USD', 'en-US')).toBe('1.23T $');
    expect(formatCompact(52_300_000, null, 'en-US')).toBe('52.3M');
  });

  it('always signs percentages', () => {
    expect(formatPercent(3.2, 2, 'en-US')).toBe('+3.20%');
    expect(formatPercent(-1.05, 2, 'en-US')).toBe(`${MINUS}1.05%`);
    expect(formatPercent(0, 2, 'en-US')).toBe('0.00%');
    expect(formatPlainPercent(75, 0, 'en-US')).toBe('75%');
    expect(formatSignedNumber(2.311, 'en-US')).toBe('+2.31');
  });

  it('maps changes to tones', () => {
    expect(toneOf(1)).toBe('gain');
    expect(toneOf(-0.01)).toBe('loss');
    expect(toneOf(0)).toBe('flat');
    expect(toneOf(null)).toBe('flat');
    expect(toneClass(2)).toBe('text-gain');
    expect(toneClass(-2)).toBe('text-loss');
  });

  it('labels report times and fiscal quarters', () => {
    expect(reportTimeLabel('BMO')).toBe('Before open');
    expect(reportTimeLabel('AMC')).toBe('After close');
    expect(reportTimeLabel('DMH')).toBe('During market');
    expect(reportTimeLabel('UNKNOWN')).toBe('Time TBD');
    expect(reportTimeLabel(null)).toBe('Time TBD');
    expect(fiscalLabel(3, 2026)).toBe('Q3 FY2026');
    expect(fiscalLabel(null, 2026)).toBeNull();
  });

  it('splits money into the number and the currency symbol', () => {
    expect(splitMoney(1719.99, 'USD', {}, 'en-US')).toEqual({
      amount: '1,719.99',
      symbol: '$',
      symbolFirst: false,
    });
    const czk = splitMoney(-30735.38, 'CZK', {}, 'cs-CZ');
    expect(czk.amount.replace(/\s/g, ' ')).toBe(MINUS + '30 735,38');
    expect(czk.symbol).toBe('Kč');
    expect(czk.symbolFirst).toBe(false);
    expect(splitMoney(5, 'EUR', { signed: true }, 'en-US').amount).toBe('+5.00');
    expect(splitMoney(null, 'EUR')).toEqual({ amount: DASH, symbol: '', symbolFirst: false });
  });
});

describe('locale', () => {
  it('uses the English variant of the device, else en-GB', () => {
    expect(resolveLocale(['cs-CZ', 'en-US'])).toBe('en-US');
    expect(resolveLocale(['en-GB'])).toBe('en-GB');
    expect(resolveLocale(['de-DE'])).toBe('en-GB');
    expect(resolveLocale([])).toBe('en-GB');
  });
});

describe('symbols', () => {
  it('derives initials from the ticker without its suffix', () => {
    expect(symbolInitials('AAPL')).toBe('AA');
    expect(symbolInitials('SAP.DE')).toBe('SA');
    expect(symbolInitials('BRK-B', 1)).toBe('B');
    expect(baseSymbol('SAP.DE')).toBe('SAP');
    expect(baseSymbol('BRK-B')).toBe('BRK-B');
  });

  it('gives each symbol a stable colour', () => {
    expect(symbolColor('AAPL')).toBe(symbolColor('AAPL'));
    expect(symbolColor('AAPL')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
