/**
 * The UI is English, so numbers and dates use the device's English variant (en-US, en-GB, en-IE, …) and fall back
 * to en-GB (day before month) on devices set to another language.
 */
export function resolveLocale(languages: readonly string[]): string {
  return languages.find((l) => /^en(-|$)/i.test(l)) ?? 'en-GB';
}

export const APP_LOCALE = resolveLocale(
  typeof navigator === 'undefined' ? [] : navigator.languages,
);
