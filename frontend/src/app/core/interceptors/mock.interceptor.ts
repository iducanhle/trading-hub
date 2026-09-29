import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MockBackend } from '../mocks/mock-backend';

const API = `${environment.apiBaseUrl}/api`;

/** Mock mode only (environment.useMocks): answers API calls from src/assets/mocks instead of the backend. */
export const mockInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith(`${API}/`) ? inject(MockBackend).handle(req, req.url.slice(API.length)) : next(req);
