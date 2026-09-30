import {
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Firestore,
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// The real allowlist (placeholders or the owner's addresses) is swapped for test accounts.
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8').replace(
  /function allowlist\(\) \{[\s\S]*?\}/,
  "function allowlist() { return ['alice@example.com', 'bob@example.com']; }",
);

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-rules', firestore: { rules } });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string, email: string, verified = true): Firestore =>
  env
    .authenticatedContext(uid, { email, email_verified: verified })
    .firestore() as unknown as Firestore;
const alice = () => as('alice', 'alice@example.com');
const anonymous = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const settings = {
  theme: 'system',
  notificationsEnabled: true,
  notifyDaysBefore: 1,
  notificationEmail: null,
};
const newUser = () => ({
  email: 'alice@example.com',
  displayName: null,
  createdAt: serverTimestamp(),
  settings,
});
const follow = (symbol = 'SAP.DE') => ({
  symbol,
  name: 'SAP SE',
  exchange: 'XETRA',
  region: 'EU',
  logoUrl: null,
  followedAt: serverTimestamp(),
});

/** Seeds alice's user document without rules. */
async function seedAlice(): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'users/alice'), { ...newUser(), createdAt: Timestamp.now() });
  });
}

describe('users/{uid}', () => {
  it('lets an allowed, verified owner create and read the document', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), newUser()));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });

  it('matches the allowlist case-insensitively', async () => {
    await assertSucceeds(
      setDoc(doc(as('bob', 'Bob@Example.com'), 'users/bob'), {
        ...newUser(),
        email: 'Bob@Example.com',
      }),
    );
  });

  it('refuses signed-out, unverified and non-allowlisted users', async () => {
    await assertFails(setDoc(doc(anonymous(), 'users/alice'), newUser()));
    await assertFails(
      setDoc(doc(as('alice', 'alice@example.com', false), 'users/alice'), newUser()),
    );
    await assertFails(setDoc(doc(as('eve', 'eve@example.com'), 'users/eve'), newUser()));
    await seedAlice();
    await assertFails(getDoc(doc(as('alice', 'alice@example.com', false), 'users/alice')));
  });

  it("keeps each user's document private, even from the other allowed user", async () => {
    await seedAlice();
    await assertFails(getDoc(doc(as('bob', 'bob@example.com'), 'users/alice')));
    await assertFails(setDoc(doc(as('bob', 'bob@example.com'), 'users/alice'), newUser()));
  });

  it('validates the settings', async () => {
    const bad = [
      { ...settings, theme: 'neon' },
      { ...settings, notifyDaysBefore: 0 },
      { ...settings, notifyDaysBefore: 8 },
      { ...settings, notifyDaysBefore: 1.5 },
      { ...settings, notificationsEnabled: 'yes' },
      { ...settings, notificationEmail: 'not-an-email' },
      { ...settings, extra: true },
      { ...settings, language: 'de' },
    ];
    for (const s of bad)
      await assertFails(setDoc(doc(alice(), 'users/alice'), { ...newUser(), settings: s }));
    await assertFails(
      setDoc(doc(alice(), 'users/alice'), { ...newUser(), createdAt: Timestamp.fromMillis(0) }),
    );
  });

  it('allows settings updates but not changes to the email or creation time', async () => {
    await seedAlice();
    await assertSucceeds(
      updateDoc(doc(alice(), 'users/alice'), {
        'settings.notifyDaysBefore': 7,
        'settings.notificationEmail': 'me@example.org',
        'settings.theme': 'dark',
      }),
    );
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { 'settings.language': 'cs' }));
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { 'settings.language': null }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { 'settings.language': 'xx' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { 'settings.notifyDaysBefore': 9 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { email: 'other@example.com' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { createdAt: Timestamp.now() }));
  });
});

describe('users/{uid}/follows/{symbol}', () => {
  it('lets the owner follow, re-follow with the original time (Undo) and unfollow', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/follows/SAP.DE'), follow()));
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice/follows/SAP.DE'), {
        ...follow(),
        followedAt: Timestamp.fromMillis(1e12),
      }),
    );
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/follows/SAP.DE')));
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/follows/SAP.DE')));
  });

  it('rejects malformed follows and other users', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/follows/AAPL'), follow('SAP.DE')));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/follows/SAP.DE'), { ...follow(), region: 'ASIA' }),
    );
    await assertFails(
      setDoc(doc(alice(), 'users/alice/follows/SAP.DE'), { ...follow(), extra: 1 }),
    );
    await assertFails(
      setDoc(doc(as('bob', 'bob@example.com'), 'users/alice/follows/SAP.DE'), follow()),
    );
  });
});

describe('users/{uid}/notes/{symbol}', () => {
  const note = (text: string) => ({ symbol: 'AAPL', text, updatedAt: serverTimestamp() });

  it('accepts notes up to 10,000 characters with a server timestamp', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/notes/AAPL'), note('x'.repeat(10_000))));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/notes/AAPL')));
  });

  it('rejects longer notes, client timestamps and other users', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/notes/AAPL'), note('x'.repeat(10_001))));
    await assertFails(
      setDoc(doc(alice(), 'users/alice/notes/AAPL'), { ...note('hi'), updatedAt: Timestamp.now() }),
    );
    await assertFails(getDoc(doc(as('bob', 'bob@example.com'), 'users/alice/notes/AAPL')));
  });
});

describe('backend-only collections', () => {
  it('are closed to every client', async () => {
    for (const path of [
      'symbols/AAPL',
      'prices/AAPL',
      'earnings/AAPL',
      'earningsCalendar/2026-09-30',
      'fx/latest',
      'jobRuns/calendar-refresh',
      'notificationLog/x',
      'viewed/x',
    ]) {
      await assertFails(getDoc(doc(alice(), path)));
      await assertFails(setDoc(doc(alice(), path), { x: 1 }));
    }
  });
});
