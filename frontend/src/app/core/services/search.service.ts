import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

/** Opens stock search over the current page (full screen on phones, a centered dialog on wider screens). */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly dialog = inject(MatDialog);
  private opening = false;
  private readonly openState = signal(false);
  /** Whether the search overlay is open (the portfolio pill stays above it). */
  readonly isOpen = this.openState.asReadonly();

  async open(): Promise<void> {
    if (this.opening || this.dialog.getDialogById('app-search')) return;
    this.opening = true;
    try {
      const { SearchPage } = await import('../../features/search/search-page');
      const wide = matchMedia('(min-width: 640px)').matches;
      const ref = this.dialog.open(SearchPage, {
        id: 'app-search',
        panelClass: 'app-search-panel',
        ariaLabel: $localize`Search`,
        autoFocus: false,
        restoreFocus: true,
        ...(wide
          ? { width: 'calc(100vw - 32px)', maxWidth: '42rem', height: 'min(40rem, calc(100dvh - 64px))' }
          : { width: '100%', maxWidth: '100%', height: '100%' }),
      });
      this.openState.set(true);
      ref.afterClosed().subscribe(() => this.openState.set(false));
    } finally {
      this.opening = false;
    }
  }

  close(): void {
    this.dialog.getDialogById('app-search')?.close();
  }
}
