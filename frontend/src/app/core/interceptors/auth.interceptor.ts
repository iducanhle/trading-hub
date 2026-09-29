import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../services/session.service';

const API_PREFIX = `${environment.apiBaseUrl}/api/`;

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Adds the Firebase ID token to API calls (the SDK refreshes it before it expires). On a 401 it retries once with a
 * force-refreshed token; a second 401 signs the user out.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_PREFIX) || req.url === `${API_PREFIX}health`) return next(req);
  const auth = inject(AuthService);
  const injector = inject(Injector);

  return from(auth.idToken()).pipe(
    switchMap((token) => next(withToken(req, token))),
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      return from(auth.idToken(true)).pipe(
        switchMap((token) => next(withToken(req, token))),
        catchError((retryError: unknown) => {
          if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
            void injector.get(SessionService).signOut();
          }
          return throwError(() => retryError);
        }),
      );
    }),
  );
};
