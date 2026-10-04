import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AppUser } from '../auth/auth.service';
import { LANGUAGE, switchLanguage } from '../i18n/language';
import { UserDataGateway } from '../data/user-data.gateway';
import { DEFAULT_SETTINGS, ThemePreference, UserSettings } from '../models/user-data';
import { roundNumbers } from '../../shared/utils/format';
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
  /** Set when the document cannot be read or created, e.g. the Firestore rules refused this account. */
  readonly error = signal<unknown>(null);
  private user: AppUser | null = null;

  start(user: AppUser): void {
    if (this.uid === user.uid) return;
    this.stop();
    this.uid = user.uid;
    this.user = user;
    let creating = false;
    this.subscription = this.gateway.watchUser(user.uid).subscribe({
      next: ({ doc, fromCache }) => {
        if (!doc) {
          // Only the server can say the document does not exist; the local cache may just not have it yet.
          if (!fromCache && !creating) {
            creating = true;
            this.gateway
              .createUser(user.uid, {
                email: user.email ?? '',
                displayName: user.displayName,
                settings: DEFAULT_SETTINGS,
              })
              .catch((error: unknown) => {
                console.error('Could not create the user document', error);
                this.error.set(error);
              });
          }
          return;
        }
        this.settings.set(doc.settings);
        roundNumbers.set(doc.settings.roundNumbers);
        this.error.set(null);
        this.loaded.set(true);
        if (doc.settings.theme !== this.theme.preference())
          this.theme.setPreference(doc.settings.theme);
        // Chosen on another device: switch this one too (reloads).
        const language = doc.settings.language;
        if (language && language !== LANGUAGE) switchLanguage(language);
      },
      error: (error: unknown) => {
        console.error('Settings listener failed', error);
        this.error.set(error);
      },
    });
  }

  /** Starts again after a failure. */
  retry(): void {
    const user = this.user;
    if (!user) return;
    this.stop();
    this.start(user);
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.uid = null;
    this.error.set(null);
    this.loaded.set(false);
    this.settings.set(DEFAULT_SETTINGS);
    roundNumbers.set(DEFAULT_SETTINGS.roundNumbers);
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
