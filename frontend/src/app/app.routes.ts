import { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { allowedGuard, authGuard, guestGuard, signedInGuard } from './core/auth/auth.guards';
import { Shell } from './core/layout/shell';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Create account',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'reset-password',
    title: 'Reset password',
    loadComponent: () => import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'verify-email',
    title: 'Verify your email',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/auth/verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'no-access',
    title: 'No access',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/auth/no-access/no-access').then((m) => m.NoAccess),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, allowedGuard],
    children: [
      {
        path: 'search',
        title: 'Search',
        loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
      },
      {
        path: 'stock/:symbol',
        title: (route: ActivatedRouteSnapshot) => (route.paramMap.get('symbol') ?? '').toUpperCase(),
        loadComponent: () => import('./features/stock-detail/stock-detail-page').then((m) => m.StockDetailPage),
      },
      {
        path: 'followed',
        title: 'Followed',
        loadComponent: () => import('./features/followed/followed-page').then((m) => m.FollowedPage),
      },
      {
        path: 'calendar',
        title: 'Calendar',
        loadComponent: () => import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'followed' },
      { path: '**', redirectTo: 'followed' },
    ],
  },
];
