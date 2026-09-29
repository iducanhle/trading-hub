import { Injectable, signal } from '@angular/core';
import { AppUser, AuthService, GoogleSignInResult } from './auth.service';

const MOCK_USER: AppUser = {
  uid: 'mock-user',
  email: 'mock@example.com',
  displayName: 'Mock User',
  photoUrl: null,
  emailVerified: true,
  providers: ['password'],
};

const SIGNED_OUT_KEY = 'et.mock.signedOut';

/** Mock mode: a fake, verified, allowed user. Every sign-in button signs in; sign-out works for the session. */
@Injectable()
export class MockAuthService extends AuthService {
  private readonly state = signal<AppUser | null | undefined>(
    sessionStorage.getItem(SIGNED_OUT_KEY) ? null : MOCK_USER,
  );
  readonly user = this.state.asReadonly();

  ready(): Promise<AppUser | null> {
    return Promise.resolve(this.state() ?? null);
  }

  async idToken(): Promise<string | null> {
    return this.state() ? 'mock-id-token' : null;
  }

  async signInWithGoogle(): Promise<GoogleSignInResult> {
    this.signIn();
    return 'signed-in';
  }

  async completeRedirectSignIn(): Promise<void> {
    // Nothing to complete in mock mode.
  }

  redirectPending(): boolean {
    return false;
  }

  async signInWithEmail(): Promise<void> {
    this.signIn();
  }

  async register(): Promise<void> {
    this.signIn();
  }

  async sendVerificationEmail(): Promise<void> {
    // No email in mock mode.
  }

  async reload(): Promise<AppUser | null> {
    return this.state() ?? null;
  }

  async sendPasswordReset(): Promise<void> {
    // No email in mock mode.
  }

  async signOut(): Promise<void> {
    sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    this.state.set(null);
  }

  private signIn(): void {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
    this.state.set(MOCK_USER);
  }
}
