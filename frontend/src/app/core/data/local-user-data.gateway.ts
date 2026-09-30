import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { Region } from '../models/contract';
import { DEFAULT_SETTINGS, FollowDoc, NoteDoc, UserDoc, UserSettings } from '../models/user-data';
import { NewFollow, UserDataGateway, UserDocSnapshot } from './user-data.gateway';

interface Store {
  user: UserDoc | null;
  follows: FollowDoc[];
  notes: Record<string, NoteDoc>;
}

const STORAGE_KEY = 'et.mock.userData';

/** Followed stocks of a fresh mock user. */
const SEED_FOLLOWS: { symbol: string; name: string; exchange: string; region: Region }[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', region: 'US' },
  { symbol: 'SAP.DE', name: 'SAP SE', exchange: 'XETRA', region: 'EU' },
  { symbol: 'MU', name: 'Micron Technology, Inc.', exchange: 'NASDAQ', region: 'US' },
  { symbol: 'NKE', name: 'NIKE, Inc.', exchange: 'NYSE', region: 'US' },
  { symbol: 'ASML.AS', name: 'ASML Holding N.V.', exchange: 'Euronext Amsterdam', region: 'EU' },
];

function revive(store: Store): Store {
  const date = (v: Date | string | null) => (v ? new Date(v) : null);
  return {
    user: store.user ? { ...store.user, createdAt: date(store.user.createdAt) } : null,
    follows: store.follows.map((f) => ({ ...f, followedAt: date(f.followedAt) })),
    notes: Object.fromEntries(
      Object.entries(store.notes).map(([k, n]) => [k, { ...n, updatedAt: date(n.updatedAt) }]),
    ),
  };
}

/**
 * Mock mode (and unit tests): one user's documents in memory, persisted to localStorage so a reload keeps
 * follows, notes and settings. The uid is ignored.
 */
@Injectable()
export class LocalUserDataGateway extends UserDataGateway {
  private readonly store$ = new BehaviorSubject<Store>(this.load());

  private load(): Store {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return revive(JSON.parse(raw) as Store);
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
    const now = Date.now();
    return {
      user: null,
      follows: SEED_FOLLOWS.map((f, i) => ({
        ...f,
        logoUrl: null,
        followedAt: new Date(now - (i + 1) * 86_400_000),
      })),
      notes: {},
    };
  }

  private update(change: (store: Store) => Store): void {
    const next = change(this.store$.value);
    this.store$.next(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: keep the in-memory copy.
    }
  }

  watchUser(): Observable<UserDocSnapshot> {
    return this.store$.pipe(map((s) => ({ doc: s.user, fromCache: false })));
  }

  async createUser(_uid: string, doc: Omit<UserDoc, 'createdAt'>): Promise<void> {
    this.update((s) => ({ ...s, user: { ...doc, createdAt: new Date() } }));
  }

  async updateSettings(_uid: string, patch: Partial<UserSettings>): Promise<void> {
    this.update((s) => ({
      ...s,
      user: {
        ...(s.user ?? {
          email: '',
          displayName: null,
          createdAt: new Date(),
          settings: DEFAULT_SETTINGS,
        }),
        settings: { ...(s.user?.settings ?? DEFAULT_SETTINGS), ...patch },
      },
    }));
  }

  watchFollows(): Observable<FollowDoc[]> {
    return this.store$.pipe(map((s) => s.follows));
  }

  async follow(_uid: string, follow: NewFollow): Promise<void> {
    const doc: FollowDoc = { ...follow, followedAt: follow.followedAt ?? new Date() };
    this.update((s) => ({
      ...s,
      follows: [...s.follows.filter((f) => f.symbol !== doc.symbol), doc],
    }));
  }

  async unfollow(_uid: string, symbol: string): Promise<void> {
    this.update((s) => ({ ...s, follows: s.follows.filter((f) => f.symbol !== symbol) }));
  }

  async getNote(_uid: string, symbol: string): Promise<NoteDoc | null> {
    return this.store$.value.notes[symbol] ?? null;
  }

  async saveNote(_uid: string, symbol: string, text: string): Promise<void> {
    this.update((s) => ({
      ...s,
      notes: { ...s.notes, [symbol]: { symbol, text, updatedAt: new Date() } },
    }));
  }

  /** Current follows, for the mock API (calendar "followed only", followed earnings). */
  followedSymbols(): Set<string> {
    return new Set(this.store$.value.follows.map((f) => f.symbol));
  }
}
