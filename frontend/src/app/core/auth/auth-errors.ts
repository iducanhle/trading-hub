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
      return 'Wrong email or password.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked. Allow popups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email already signs in another way. Use email and password, or the method you used before.';
    case 'auth/user-disabled':
      return 'This account is disabled.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for sign-in (Firebase console → Authentication → Settings).';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in the Firebase console.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'The Firebase config is missing or wrong (src/environments).';
    default:
      return 'Sign-in failed. Please try again.';
  }
}
