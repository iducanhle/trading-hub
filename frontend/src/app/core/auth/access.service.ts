import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../api/api-error';
import { ApiService } from '../api/api.service';

/** `unknown`: the check itself failed (offline, server down); the app still opens and shows inline errors. */
export type AccessResult = 'allowed' | 'denied' | 'unknown';

/** Asks the backend once per session (per user) whether this account may use the app: `GET /api/me`. */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly api = inject(ApiService);
  private uid: string | null = null;
  private result: Promise<AccessResult> | null = null;

  check(uid: string): Promise<AccessResult> {
    if (this.uid !== uid || !this.result) {
      this.uid = uid;
      this.result = firstValueFrom(this.api.me()).then(
        () => 'allowed' as const,
        (error: unknown) => {
          const apiError: ApiError = toApiError(error);
          if (apiError.code === 'NOT_ALLOWED') return 'denied' as const;
          // Don't remember a failed check: the next navigation asks again.
          this.result = null;
          return 'unknown' as const;
        },
      );
    }
    return this.result;
  }

  reset(): void {
    this.uid = null;
    this.result = null;
  }
}
