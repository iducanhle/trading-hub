import { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { allowedGuard, authGuard, guestGuard, signedInGuard } from './core/auth/auth.guards';
import { Shell } from './core/layout/shell';
import { displayTicker } from './features/portfolio/portfolio-model';

export const routes: Routes = [
  {
    path: 'login',
    title: $localize`Sign in`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: $localize`Create account`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'reset-password',
    title: $localize`Reset password`,
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'verify-email',
    title: $localize`Verify your email`,
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'no-access',
    title: $localize`No access`,
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
        title: $localize`Search`,
        loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
      },
      {
        path: 'stock/:symbol',
        title: (route: ActivatedRouteSnapshot) =>
          (route.paramMap.get('symbol') ?? '').toUpperCase(),
        loadComponent: () =>
          import('./features/stock-detail/stock-detail-page').then((m) => m.StockDetailPage),
      },
      {
        path: 'followed',
        title: $localize`Followed`,
        loadComponent: () =>
          import('./features/followed/followed-page').then((m) => m.FollowedPage),
      },
      {
        path: 'calendar',
        title: $localize`Calendar`,
        loadComponent: () =>
          import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'events',
        title: $localize`Events`,
        loadComponent: () =>
          import('./features/market-events/events-page').then((m) => m.EventsPage),
      },
      {
        path: 'portfolio',
        title: $localize`Portfolio`,
        loadComponent: () =>
          import('./features/portfolio/portfolio-page').then((m) => m.PortfolioPage),
      },
      {
        path: 'portfolio/:t212Ticker',
        title: (route: ActivatedRouteSnapshot) =>
          displayTicker({ symbol: null, t212Ticker: route.paramMap.get('t212Ticker') ?? '' }),
        loadComponent: () =>
          import('./features/portfolio/instrument-page').then((m) => m.InstrumentPage),
      },
      {
        path: 'settings',
        title: $localize`Settings`,
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
      {
        path: '',
        pathMatch: 'full',
        title: 'Tradiqo',
        loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
      },
      { path: '**', redirectTo: 'followed' },
    ],
  },
];
