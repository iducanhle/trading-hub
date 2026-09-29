import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AppUser } from '../auth/auth.service';
import { UserDataGateway } from '../data/user-data.gateway';
import { DEFAULT_SETTINGS, ThemePreference, UserSettings } from '../models/user-data';
import { ThemeService } from './theme.service';

/** `users/{uid}.settings`, live. Creates the user document with the contract defaults on first login. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly gateway = inject(UserDataGateway);
  private readonly theme = inject(ThemeService);
  private subscription?: Subscription;
  private uid: string | null = null;

  readonly settings = signal<UserSettings>(DEFAULT_SETTINGS);
  /** False until the document has been read (or created). */
  readonly loaded = signal(false);

  start(user: AppUser): void {
    if (this.uid === user.uid) return;
    this.stop();
    this.uid = user.uid;
    let creating = false;
    this.subscription = this.gateway.watchUser(user.uid).subscribe({
      next: ({ doc, fromCache }) => {
        if (!doc) {
          // Only the server can say the document does not exist; the local cache may just not have it yet.
          if (!fromCache && !creating) {
            creating = true;
            this.gateway
              .createUser(user.uid, { email: user.email ?? '', displayName: user.displayName, settings: DEFAULT_SETTINGS })
              .catch((error: unknown) => console.error('Could not create the user document', error));
          }
          return;
        }
        this.settings.set(doc.settings);
        this.loaded.set(true);
        if (doc.settings.theme !== this.theme.preference()) this.theme.setPreference(doc.settings.theme);
      },
      error: (error: unknown) => console.error('Settings listener failed', error),
    });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.uid = null;
    this.loaded.set(false);
    this.settings.set(DEFAULT_SETTINGS);
  }

  /** Optimistic: the UI updates at once, Firestore follows. */
  async update(patch: Partial<UserSettings>): Promise<void> {
    if (!this.uid) return;
    const previous = this.settings();
    this.settings.set({ ...previous, ...patch });
    try {
      await this.gateway.updateSettings(this.uid, patch);
    } catch (error) {
      this.settings.set(previous);
      throw error;
    }
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    this.theme.setPreference(theme);
    await this.update({ theme });
  }
}
