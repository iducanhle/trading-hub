import { AppUser } from '../../core/auth/auth.service';

/** Up to two initials from the display name, else from the email. */
export function userInitials(user: AppUser | null | undefined): string {
  const source = user?.displayName || user?.email || '?';
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** How the user signed in: "Google", "Email and password". */
export function providerLabel(user: AppUser | null | undefined): string {
  const providers = user?.providers ?? [];
  if (providers.includes('google.com')) return 'Google';
  if (providers.includes('password')) return $localize`Email and password`;
  return $localize`Signed in`;
}
