import { Injectable, inject, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getIdToken,
  getRedirectResult,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { FirebaseService } from '../firebase/firebase.service';
import { AppUser, AuthService, GoogleSignInResult } from './auth.service';

const REDIRECT_KEY = 'et.redirectSignIn';

function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    emailVerified: user.emailVerified,
    providers: user.providerData.map((p) => p.providerId),
  };
}

function sameUser(a: AppUser | null | undefined, b: AppUser | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.uid === b.uid &&
    a.email === b.email &&
    a.emailVerified === b.emailVerified &&
    a.displayName === b.displayName &&
    a.photoUrl === b.photoUrl &&
    a.providers.join() === b.providers.join()
  );
}

/** Phones, tablets and the installed app use the redirect flow; popups are unreliable there. */
export function prefersRedirect(): boolean {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || matchMedia('(pointer: coarse)').matches;
}

@Injectable()
export class FirebaseAuthService extends AuthService {
  private readonly auth = inject(FirebaseService).auth;
  private readonly state = signal<AppUser | null | undefined>(undefined);
  readonly user = this.state.asReadonly();
  private readonly firstState: Promise<AppUser | null>;

  constructor() {
    super();
    // onIdTokenChanged also fires after a forced token refresh, e.g. once the email is verified.
    this.firstState = new Promise((resolve) => {
      onIdTokenChanged(this.auth, (user) => {
        const mapped = user ? toAppUser(user) : null;
        if (!sameUser(this.state(), mapped)) this.state.set(mapped);
        resolve(mapped);
      });
    });
  }

  /** Waits for the first auth state, then returns the current user (not the first one: that stays null after sign-in). */
  ready(): Promise<AppUser | null> {
    return this.firstState.then(() => this.state() ?? null);
  }

  async idToken(forceRefresh = false): Promise<string | null> {
    await this.firstState;
    const user = this.auth.currentUser;
    return user ? getIdToken(user, forceRefresh) : null;
  }

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (prefersRedirect()) {
      sessionStorage.setItem(REDIRECT_KEY, '1');
      await signInWithRedirect(this.auth, provider, browserPopupRedirectResolver);
      return 'redirecting';
    }
    this.signedIn((await signInWithPopup(this.auth, provider, browserPopupRedirectResolver)).user);
    return 'signed-in';
  }

  redirectPending(): boolean {
    return sessionStorage.getItem(REDIRECT_KEY) === '1';
  }

  async completeRedirectSignIn(): Promise<void> {
    if (!this.redirectPending()) return;
    try {
      const result = await getRedirectResult(this.auth, browserPopupRedirectResolver);
      if (result) this.signedIn(result.user);
    } finally {
      sessionStorage.removeItem(REDIRECT_KEY);
    }
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    this.signedIn((await signInWithEmailAndPassword(this.auth, email.trim(), password)).user);
  }

  async register(email: string, password: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    this.signedIn(user);
    await sendEmailVerification(user, { url: `${location.origin}/verify-email` });
  }

  /** Auth listeners fire asynchronously; publish the user now so the caller can navigate right away. */
  private signedIn(user: User): void {
    const mapped = toAppUser(user);
    if (!sameUser(this.state(), mapped)) this.state.set(mapped);
  }

  async sendVerificationEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) await sendEmailVerification(user, { url: `${location.origin}/verify-email` });
  }

  async reload(): Promise<AppUser | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    await reload(user);
    // The ID token carries email_verified from when it was issued; refresh it so the backend and the
    // Firestore rules see the new value.
    await getIdToken(user, true);
    this.signedIn(user);
    return this.state() ?? null;
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email.trim(), { url: `${location.origin}/login` });
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.state.set(null);
  }
}
