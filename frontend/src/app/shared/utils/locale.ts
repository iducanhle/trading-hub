import { LANGUAGE } from '../../core/i18n/language';

/**
 * Dates in English use the device's English variant (en-US, en-GB, en-IE, …) and fall back to en-GB (day before
 * month) on devices set to another language. In Czech: cs-CZ.
 */
export function resolveLocale(languages: readonly string[]): string {
  return languages.find((l) => /^en(-|$)/i.test(l)) ?? 'en-GB';
}

export const APP_LOCALE =
  LANGUAGE === 'cs'
    ? 'cs-CZ'
    : resolveLocale(typeof navigator === 'undefined' ? [] : navigator.languages);
