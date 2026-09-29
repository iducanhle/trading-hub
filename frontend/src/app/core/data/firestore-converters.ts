import type {
  DocumentData,
  FieldValue,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
} from 'firebase/firestore';
import type { FirestoreSdk } from '../firebase/firebase.service';
import { DEFAULT_SETTINGS, FollowDoc, NoteDoc, ThemePreference, UserDoc, UserSettings } from '../models/user-data';

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Pending server timestamps read as an estimate instead of null. */
const READ_OPTIONS: SnapshotOptions = { serverTimestamps: 'estimate' };

function toDate(value: unknown): Date | null {
  return value && typeof (value as Timestamp).toDate === 'function' ? (value as Timestamp).toDate() : null;
}

/** Settings as stored, with every missing or invalid field replaced by its default. */
export function normalizeSettings(raw: unknown): UserSettings {
  const s = (raw ?? {}) as Partial<Record<keyof UserSettings, unknown>>;
  const days = typeof s.notifyDaysBefore === 'number' ? Math.round(s.notifyDaysBefore) : NaN;
  return {
    theme: THEMES.includes(s.theme as ThemePreference) ? (s.theme as ThemePreference) : DEFAULT_SETTINGS.theme,
    notificationsEnabled:
      typeof s.notificationsEnabled === 'boolean' ? s.notificationsEnabled : DEFAULT_SETTINGS.notificationsEnabled,
    notifyDaysBefore: days >= 1 && days <= 7 ? days : DEFAULT_SETTINGS.notifyDaysBefore,
    notificationEmail: typeof s.notificationEmail === 'string' && s.notificationEmail ? s.notificationEmail : null,
  };
}

export interface Converters {
  user: FirestoreDataConverter<UserDoc>;
  follow: FirestoreDataConverter<FollowDoc>;
  note: FirestoreDataConverter<NoteDoc>;
}

/**
 * Typed converters between the app models and Firestore. A null date is written as the server time, which is what
 * the security rules expect for `createdAt` and `updatedAt`.
 */
export function createConverters(sdk: FirestoreSdk): Converters {
  const timestamp = (date: Date | null): Timestamp | FieldValue =>
    date ? sdk.Timestamp.fromDate(date) : sdk.serverTimestamp();

  return {
    user: {
      toFirestore: (user: UserDoc): DocumentData => ({
        email: user.email,
        displayName: user.displayName,
        createdAt: timestamp(user.createdAt),
        settings: { ...user.settings },
      }),
      fromFirestore: (snap: QueryDocumentSnapshot, options?: SnapshotOptions): UserDoc => {
        const d = snap.data({ ...READ_OPTIONS, ...options });
        return {
          email: typeof d['email'] === 'string' ? d['email'] : '',
          displayName: typeof d['displayName'] === 'string' ? d['displayName'] : null,
          createdAt: toDate(d['createdAt']),
          settings: normalizeSettings(d['settings']),
        };
      },
    },
    follow: {
      toFirestore: (follow: FollowDoc): DocumentData => ({
        symbol: follow.symbol,
        name: follow.name,
        exchange: follow.exchange,
        region: follow.region,
        logoUrl: follow.logoUrl,
        followedAt: timestamp(follow.followedAt),
      }),
      fromFirestore: (snap: QueryDocumentSnapshot, options?: SnapshotOptions): FollowDoc => {
        const d = snap.data({ ...READ_OPTIONS, ...options });
        return {
          symbol: typeof d['symbol'] === 'string' ? d['symbol'] : snap.id,
          name: typeof d['name'] === 'string' ? d['name'] : snap.id,
          exchange: typeof d['exchange'] === 'string' ? d['exchange'] : '',
          region: d['region'] === 'EU' ? 'EU' : 'US',
          logoUrl: typeof d['logoUrl'] === 'string' ? d['logoUrl'] : null,
          followedAt: toDate(d['followedAt']),
        };
      },
    },
    note: {
      toFirestore: (note: NoteDoc): DocumentData => ({
        symbol: note.symbol,
        text: note.text,
        updatedAt: timestamp(note.updatedAt),
      }),
      fromFirestore: (snap: QueryDocumentSnapshot, options?: SnapshotOptions): NoteDoc => {
        const d = snap.data({ ...READ_OPTIONS, ...options });
        return {
          symbol: typeof d['symbol'] === 'string' ? d['symbol'] : snap.id,
          text: typeof d['text'] === 'string' ? d['text'] : '',
          updatedAt: toDate(d['updatedAt']),
        };
      },
    },
  };
}
