import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from '../api/api-error';
import { ApiService } from '../api/api.service';
import { resolveAuthDomain } from '../firebase/firebase.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { SessionService } from '../services/session.service';
import { AccessService } from './access.service';
import { allowedGuard, authGuard, guestGuard, safeReturnUrl } from './auth.guards';
import { AppUser, AuthService } from './auth.service';

const verified: AppUser = {
  uid: 'u1',
  email: 'a@example.com',
  displayName: null,
  photoUrl: null,
  emailVerified: true,
  providers: ['password'],
};

function fakeAuth(user: AppUser | null) {
  return {
    user: signal(user),
    ready: () => Promise.resolve(user),
    idToken: vi.fn(async (force?: boolean) => (force ? 'fresh-token' : 'token')),
  };
}

function runGuard(guard: typeof authGuard, url = '/stock/AAPL', query: Record<string, string> = {}) {
  const route = { queryParamMap: new Map(Object.entries(query)) } as unknown as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(() => guard(route, { url } as RouterStateSnapshot)) as Promise<
    boolean | UrlTree
  >;
}

describe('guards', () => {
  function setup(user: AppUser | null, access: 'allowed' | 'denied' | 'unknown' = 'allowed') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth(user) },
        { provide: AccessService, useValue: { check: vi.fn(async () => access) } },
      ],
    });
    return TestBed.inject(Router);
  }

  it('authGuard sends signed-out users to /login with the return URL', async () => {
    const router = setup(null);
    const result = await runGuard(authGuard);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fstock%2FAAPL');
  });

  it('authGuard sends unverified users to /verify-email', async () => {
    const router = setup({ ...verified, emailVerified: false });
    expect(router.serializeUrl((await runGuard(authGuard)) as UrlTree)).toBe('/verify-email');
  });

  it('authGuard lets verified users in', async () => {
    setup(verified);
    expect(await runGuard(authGuard)).toBe(true);
  });

  it('allowedGuard shows /no-access when the backend says NOT_ALLOWED', async () => {
    const router = setup(verified, 'denied');
    expect(router.serializeUrl((await runGuard(allowedGuard)) as UrlTree)).toBe('/no-access');
  });

  it('allowedGuard lets the app open when the check could not run (offline)', async () => {
    setup(verified, 'unknown');
    expect(await runGuard(allowedGuard)).toBe(true);
  });

  it('guestGuard forwards signed-in users to their return URL', async () => {
    const router = setup(verified);
    const result = await runGuard(guestGuard, '/login', { returnUrl: '/calendar' });
    expect(router.serializeUrl(result as UrlTree)).toBe('/calendar');
  });

  it('only accepts in-app return URLs', () => {
    expect(safeReturnUrl('/stock/SAP.DE')).toBe('/stock/SAP.DE');
    expect(safeReturnUrl('https://evil.example')).toBe('/followed');
    expect(safeReturnUrl('//evil.example')).toBe('/followed');
    expect(safeReturnUrl('/login')).toBe('/followed');
    expect(safeReturnUrl(null)).toBe('/followed');
  });
});

describe('AccessService', () => {
  it('asks /api/me once per user, and again after a failed check', async () => {
    const me = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new ApiError(0, 'NETWORK', 'offline')))
      .mockReturnValueOnce(of({ uid: 'u1', email: 'a@example.com', allowed: true }));
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: { me } }] });
    const access = TestBed.inject(AccessService);
    expect(await access.check('u1')).toBe('unknown');
    expect(await access.check('u1')).toBe('allowed');
    expect(await access.check('u1')).toBe('allowed');
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('remembers a denial', async () => {
    const me = vi.fn(() => throwError(() => new ApiError(403, 'NOT_ALLOWED', 'not on the allowlist')));
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: { me } }] });
    const access = TestBed.inject(AccessService);
    expect(await access.check('u1')).toBe('denied');
    expect(await access.check('u1')).toBe('denied');
    expect(me).toHaveBeenCalledTimes(1);
  });
});

describe('authInterceptor', () => {
  const api = `${environment.apiBaseUrl}/api`;
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: ReturnType<typeof fakeAuth>;
  let signOut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    auth = fakeAuth(verified);
    signOut = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: SessionService, useValue: { signOut } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

  it('adds the bearer token to API calls only', async () => {
    http.get(`${api}/me`).subscribe();
    http.get('https://example.com/other').subscribe();
    await flushMicrotasks();
    expect(backend.expectOne(`${api}/me`).request.headers.get('Authorization')).toBe('Bearer token');
    expect(backend.expectOne('https://example.com/other').request.headers.has('Authorization')).toBe(false);
  });

  it('retries a 401 once with a refreshed token', async () => {
    let body: unknown;
    http.get(`${api}/me`).subscribe((b) => (body = b));
    await flushMicrotasks();
    backend.expectOne(`${api}/me`).flush({ code: 'UNAUTHENTICATED', message: 'expired' }, { status: 401, statusText: '' });
    await flushMicrotasks();
    const retry = backend.expectOne(`${api}/me`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush({ ok: true });
    expect(body).toEqual({ ok: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out after a second 401', async () => {
    let failed = false;
    http.get(`${api}/me`).subscribe({ error: () => (failed = true) });
    await flushMicrotasks();
    backend.expectOne(`${api}/me`).flush({}, { status: 401, statusText: '' });
    await flushMicrotasks();
    backend.expectOne(`${api}/me`).flush({}, { status: 401, statusText: '' });
    expect(failed).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAuthDomain', () => {
  it('uses the Hosting domain the app is served from', () => {
    expect(resolveAuthDomain('p.web.app', { hostname: 'p.firebaseapp.com', host: 'p.firebaseapp.com' })).toBe(
      'p.firebaseapp.com',
    );
    expect(resolveAuthDomain('p.firebaseapp.com', { hostname: 'p.web.app', host: 'p.web.app' })).toBe('p.web.app');
    expect(resolveAuthDomain('p.firebaseapp.com', { hostname: 'localhost', host: 'localhost:4200' })).toBe(
      'p.firebaseapp.com',
    );
  });
});
