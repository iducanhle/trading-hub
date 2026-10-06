import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { T212Service } from '../services/t212.service';

/** `/` goes to the portfolio whenever Trading 212 is connected (on launch and from the logo link). */
export const launchRedirectGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const t212 = inject(T212Service);
  await t212.load();
  return t212.connected() ? router.parseUrl('/portfolio') : true;
};
