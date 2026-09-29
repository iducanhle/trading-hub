import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

export type FirestoreSdk = typeof import('firebase/firestore');

export interface FirestoreHandle {
  sdk: FirestoreSdk;
  db: Firestore;
}

/**
 * Firebase Hosting serves the auth helper (`/__/auth/handler`) on every Hosting domain. Using the domain the app is
 * served from as `authDomain` keeps `signInWithRedirect` same-origin, so it keeps working in browsers that
 * partition third-party storage (Safari, Firefox, Chrome) — option 1 of Firebase's redirect best practices.
 * Elsewhere (localhost) the configured domain is used.
 */
export function resolveAuthDomain(configured: string, location: { hostname: string; host: string }): string {
  return /\.(web\.app|firebaseapp\.com)$/i.test(location.hostname) ? location.host : configured;
}

/**
 * The Firebase app, Auth, and a lazily loaded Firestore. Firestore is the largest part of the SDK and is only needed
 * once a signed-in, allowed user reaches the app, so it is kept out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  private firestorePromise?: Promise<FirestoreHandle>;

  constructor() {
    this.app = initializeApp({
      ...environment.firebase,
      authDomain: resolveAuthDomain(environment.firebase.authDomain, location),
    });
    // No popupRedirectResolver at startup: the Google sign-in calls pass it explicitly, so ordinary app starts
    // never set up the cross-origin auth iframe.
    this.auth = initializeAuth(this.app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
    if (environment.emulators) {
      connectAuthEmulator(this.auth, environment.emulators.authUrl, { disableWarnings: true });
    }
  }

  firestore(): Promise<FirestoreHandle> {
    this.firestorePromise ??= import('firebase/firestore').then((sdk) => {
      const emulators = environment.emulators;
      // The persistent cache keeps follows and settings available offline; the emulators get a memory cache
      // so a wiped emulator never shows stale local data.
      const db = sdk.initializeFirestore(this.app, {
        localCache: emulators
          ? sdk.memoryLocalCache()
          : sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }),
      });
      if (emulators) sdk.connectFirestoreEmulator(db, emulators.firestoreHost, emulators.firestorePort);
      return { sdk, db };
    });
    return this.firestorePromise;
  }
}
