import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorBody, ApiErrorCode } from '../models/contract';

/** Contract error codes, plus NETWORK (no response at all, e.g. offline) and UNKNOWN (unexpected body). */
export type ApiErrorKind = ApiErrorCode | 'NETWORK' | 'UNKNOWN';

const CODES: readonly ApiErrorCode[] = [
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'NOT_ALLOWED',
  'SYMBOL_NOT_FOUND',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'UPSTREAM_UNAVAILABLE',
];

const STATUS_CODES: Record<number, ApiErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'NOT_ALLOWED',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'UPSTREAM_UNAVAILABLE',
};

/** A typed API failure: the HTTP status and the contract's `{ code, message }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    CODES.includes((body as ApiErrorBody).code) &&
    typeof (body as ApiErrorBody).message === 'string'
  );
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return new ApiError(0, 'NETWORK', $localize`The server could not be reached.`);
    if (isErrorBody(error.error))
      return new ApiError(error.status, error.error.code, error.error.message);
    const code = STATUS_CODES[error.status] ?? (error.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN');
    return new ApiError(error.status, code, error.message);
  }
  return new ApiError(-1, 'UNKNOWN', error instanceof Error ? error.message : String(error));
}

export function isApiError(error: unknown, code: ApiErrorKind): boolean {
  return error instanceof ApiError && error.code === code;
}

/** Short, human text for inline error states. */
export function errorMessage(error: unknown): string {
  const code = toApiError(error).code;
  switch (code) {
    case 'NETWORK':
      return navigator.onLine
        ? $localize`Can't reach the server right now.`
        : $localize`You're offline.`;
    case 'RATE_LIMITED':
      return $localize`Too many requests. Try again in a minute.`;
    case 'UPSTREAM_UNAVAILABLE':
      return $localize`The data provider is unavailable right now.`;
    case 'SYMBOL_NOT_FOUND':
      return $localize`This symbol was not found.`;
    case 'NOT_ALLOWED':
      return $localize`Access not granted.`;
    case 'UNAUTHENTICATED':
      return $localize`Your session expired. Sign in again.`;
    default:
      return $localize`Something went wrong.`;
  }
}
