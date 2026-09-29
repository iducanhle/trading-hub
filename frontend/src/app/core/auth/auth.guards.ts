import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';

// inject() only works before the first await, so every guard injects what it needs up front.

/** Signed in with a verified email, otherwise to /login (with the return URL) or /verify-email. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const user = await inject(AuthService).ready();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (!user.emailVerified) return router.createUrlTree(['/verify-email']);
  return true;
};

/**
 * On the backend's allowlist (`GET /api/me`, checked once per session). A 403 leads to /no-access.
 * Runs next to authGuard, which handles signed-out and unverified users.
 */
export const allowedGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const access = inject(AccessService);
  const user = await inject(AuthService).ready();
  if (!user?.emailVerified) return true;
  const result = await access.check(user.uid);
  return result === 'denied' ? router.createUrlTree(['/no-access']) : true;
};

/** Login and register: signed-in users go on to the app (or to /verify-email). */
export const guestGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const user = await inject(AuthService).ready();
  if (!user) return true;
  if (!user.emailVerified) return router.createUrlTree(['/verify-email']);
  return router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')));
};

/** Pages for a signed-in user that is not (yet) in the app: /verify-email and /no-access. */
export const signedInGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await inject(AuthService).ready();
  return user ? true : router.createUrlTree(['/login']);
};

/** Only in-app paths (never another origin, never back to an auth page); defaults to /followed. */
export function safeReturnUrl(url: string | null | undefined): string {
  const inApp = !!url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\');
  const authPage = !!url && /^\/(login|register|reset-password|verify-email|no-access)\b/.test(url);
  return inApp && !authPage ? url : '/followed';
}
