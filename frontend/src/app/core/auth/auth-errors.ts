/** Firebase Auth error codes the user can act on, as plain English. Null means "say nothing" (user cancelled). */
export function authErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return $localize`Wrong email or password.`;
    case 'auth/invalid-email':
      return $localize`That email address is not valid.`;
    case 'auth/email-already-in-use':
      return $localize`An account with this email already exists. Sign in instead.`;
    case 'auth/weak-password':
      return $localize`Choose a stronger password (at least 6 characters).`;
    case 'auth/too-many-requests':
      return $localize`Too many attempts. Wait a few minutes and try again.`;
    case 'auth/network-request-failed':
      return $localize`No connection. Check your network and try again.`;
    case 'auth/popup-blocked':
      return $localize`The sign-in popup was blocked. Allow popups for this site and try again.`;
    case 'auth/account-exists-with-different-credential':
      return $localize`This email already signs in another way. Use email and password, or the method you used before.`;
    case 'auth/user-disabled':
      return $localize`This account is disabled.`;
    case 'auth/unauthorized-domain':
      return $localize`This domain is not authorized for sign-in (Firebase console → Authentication → Settings).`;
    case 'auth/operation-not-allowed':
      return $localize`This sign-in method is not enabled in the Firebase console.`;
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'The Firebase config is missing or wrong (src/environments).';
    default:
      return $localize`Sign-in failed. Please try again.`;
  }
}
