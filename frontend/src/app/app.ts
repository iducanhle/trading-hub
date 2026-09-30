import { DOCUMENT, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { NotifierService } from './core/services/notifier.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    const updates = inject(SwUpdate);
    if (!updates.isEnabled) return;
    const notifier = inject(NotifierService);
    const doc = inject(DOCUMENT);

    // A new deploy was downloaded in the background: offer to switch to it.
    updates.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(async () => {
        const ref = await notifier.show('A new version is available.', 'Reload', { duration: 0 });
        ref.onAction().subscribe(() => doc.location.reload());
      });
    updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(async () => {
      const ref = await notifier.show('The app needs to reload.', 'Reload', { duration: 0 });
      ref.onAction().subscribe(() => doc.location.reload());
    });

    // The installed app can stay open for days: look for a new version whenever it comes back to the foreground.
    const onVisible = () => {
      if (doc.visibilityState === 'visible') void updates.checkForUpdate().catch(() => undefined);
    };
    doc.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('visibilitychange', onVisible));
  }
}
