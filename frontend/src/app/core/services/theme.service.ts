import { Injectable, computed, effect, signal } from '@angular/core';
import { ThemePreference } from '../models/user-data';

/** Also read by the boot script in src/index.html, which applies the theme before Angular starts (no flash). */
export const THEME_STORAGE_KEY = 'et.theme';

/** Browser UI colour (`<meta name="theme-color">`): Material's surface colour of each theme. Keep in sync with index.html. */
export const THEME_COLORS = { light: '#faf9fd', dark: '#121316' } as const;

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage blocked: follow the system.
  }
  return 'system';
}

/**
 * Light / Dark / System. Puts `.dark` on <html> (Tailwind's dark variant) and sets `color-scheme` (Material's
 * light-dark() tokens), so both always agree; also updates the browser's theme colour.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);

  readonly preference = signal<ThemePreference>(readPreference());
  readonly dark = computed(
    () => this.preference() === 'dark' || (this.preference() === 'system' && this.systemDark()),
  );

  constructor() {
    this.media.addEventListener('change', (event) => this.systemDark.set(event.matches));
    effect(() => {
      const dark = this.dark();
      const root = document.documentElement;
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
    });
  }

  /** Applies and remembers the preference on this device (SettingsService syncs it to Firestore). */
  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage blocked: the choice lasts for this session.
    }
  }
}
