import { Signal } from '@angular/core';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  emailVerified: boolean;
  /** Sign-in providers: `google.com`, `password`. */
  providers: string[];
}

/** Result of starting Google sign-in: done (popup) or the page is navigating away (redirect). */
export type GoogleSignInResult = 'signed-in' | 'redirecting';

/**
 * Authentication, independent of Firebase so mock mode can swap in a fake allowed user.
 * Implemented by FirebaseAuthService and MockAuthService.
 */
export abstract class AuthService {
  /** `undefined` until the first auth state is known, then the user or `null`. */
  abstract readonly user: Signal<AppUser | null | undefined>;

  /** Resolves once the first auth state is known. */
  abstract ready(): Promise<AppUser | null>;

  /** A current ID token (refreshed automatically when close to expiry), or null when signed out. */
  abstract idToken(forceRefresh?: boolean): Promise<string | null>;

  /** Popup on desktop; redirect on phones, tablets and the installed app. */
  abstract signInWithGoogle(): Promise<GoogleSignInResult>;

  /** Finishes a redirect sign-in after returning to the app (no-op when none is pending). */
  abstract completeRedirectSignIn(): Promise<void>;

  /** True while a redirect sign-in started by this tab has not been completed yet. */
  abstract redirectPending(): boolean;

  abstract signInWithEmail(email: string, password: string): Promise<void>;

  /** Creates the account and sends the verification email. */
  abstract register(email: string, password: string): Promise<void>;

  abstract sendVerificationEmail(): Promise<void>;

  /** Reloads the user and refreshes the ID token, so a just-verified email reaches the backend. */
  abstract reload(): Promise<AppUser | null>;

  abstract sendPasswordReset(email: string): Promise<void>;

  abstract signOut(): Promise<void>;
}
