import { Injectable, Injector, inject } from '@angular/core';
import type {
  MatSnackBarConfig,
  MatSnackBarRef,
  TextOnlySnackBar,
} from '@angular/material/snack-bar';

/**
 * Snackbars, with Material's snack bar (and its overlay) loaded on first use instead of in the initial bundle.
 * They sit above the bottom tab bar on phones.
 */
@Injectable({ providedIn: 'root' })
export class NotifierService {
  private readonly injector = inject(Injector);

  async show(
    message: string,
    action?: string,
    config: MatSnackBarConfig = {},
  ): Promise<MatSnackBarRef<TextOnlySnackBar>> {
    const { MatSnackBar } = await import('@angular/material/snack-bar');
    return this.injector.get(MatSnackBar).open(message, action, {
      duration: action ? 5000 : 4000,
      panelClass: 'app-snackbar-offset',
      ...config,
    });
  }
}
