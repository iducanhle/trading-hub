import { Language } from '../i18n/language';
import { Region } from './contract';

// Firestore documents owned by the user (docs/CONTRACT.md, "Firestore — user-owned documents").
// Timestamps are plain Dates here; the Firestore converters translate them.

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  theme: ThemePreference;
  notificationsEnabled: boolean;
  /** 1–7 */
  notifyDaysBefore: number;
  /** null = the account email. */
  notificationEmail: string | null;
  /** UI language; null = not chosen yet (the device's language decides). */
  language: Language | null;
  /** Show the ⓘ buttons that explain trading terms. */
  termHints: boolean;
  /** Show amounts without decimals. Display only; calculations keep full precision. */
  roundNumbers: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  notificationsEnabled: true,
  notifyDaysBefore: 1,
  notificationEmail: null,
  language: null,
  termHints: true,
  roundNumbers: false,
};

/** users/{uid} */
export interface UserDoc {
  email: string;
  displayName: string | null;
  createdAt: Date | null;
  settings: UserSettings;
}

/** users/{uid}/follows/{symbol} */
export interface FollowDoc {
  symbol: string;
  name: string;
  exchange: string;
  region: Region;
  logoUrl: string | null;
  /** null while the server timestamp is pending. */
  followedAt: Date | null;
}

/** users/{uid}/notes/{symbol} */
export interface NoteDoc {
  symbol: string;
  text: string;
  updatedAt: Date | null;
}

/** Longest note the security rules accept. */
export const NOTE_MAX_LENGTH = 10_000;
