import { readLocal, writeLocal } from '../services/local-store';

// The UI language. It is fixed for a page load: main.ts loads its translations before the app starts, so changing it
// saves the choice and reloads. Keep this module free of $localize and app imports (main.ts runs it first).

export type Language = 'en' | 'cs';

export const LANGUAGES: readonly Language[] = ['en', 'cs'];

const KEY = 'et.language';

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'cs';
}

/** The saved choice, else the device language when it is Czech, else English. */
export function storedLanguage(): Language {
  const saved = readLocal<unknown>(KEY, null);
  if (isLanguage(saved)) return saved;
  const device = typeof navigator === 'undefined' ? [] : navigator.languages;
  return device.some((l) => /^(cs|sk)(-|$)/i.test(l)) ? 'cs' : 'en';
}

/** The language of this page load. */
export const LANGUAGE: Language = storedLanguage();

/**
 * Saves the choice and reloads the app in that language. Nothing happens when it is already the current one, or
 * when the choice cannot be saved (blocked storage), which would otherwise reload forever.
 */
export function switchLanguage(language: Language): void {
  writeLocal(KEY, language);
  if (language !== LANGUAGE && readLocal<unknown>(KEY, null) === language) location.reload();
}
