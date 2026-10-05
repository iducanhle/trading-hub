import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { SwUpdate } from '@angular/service-worker';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { AuthService } from '../../core/auth/auth.service';
import { LANGUAGE, Language, switchLanguage } from '../../core/i18n/language';
import { ThemePreference, UserSettings } from '../../core/models/user-data';
import { NotifierService } from '../../core/services/notifier.service';
import { SessionService } from '../../core/services/session.service';
import { SettingsService } from '../../core/services/settings.service';
import { ThemeService } from '../../core/services/theme.service';
import { APP_VERSION } from '../../core/version';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { UserAvatar } from '../../shared/components/user-avatar/user-avatar';
import { Icon } from '../../shared/icon/icon';
import { providerLabel } from '../../shared/utils/user';
import { T212Settings } from './t212-settings';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

/**
 * `/settings`: account, theme, the email digest (stored in `users/{uid}.settings`), a test email, Trading 212, and
 * About. `/settings#trading212` scrolls to the Trading 212 section.
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    MatButton,
    MatIconButton,
    Segmented,
    Segment,
    MatSlideToggle,
    PageHeader,
    ErrorState,
    Skeleton,
    Icon,
    UserAvatar,
    T212Settings,
  ],
  template: `
    <app-page-header title="Settings" i18n-title />
    <div class="mx-auto max-w-2xl space-y-5 px-3 pt-2 pb-end">
      <section aria-labelledby="account-title" class="app-card flex items-center gap-3.5">
        <h2 id="account-title" class="sr-only" i18n>Account</h2>
        <app-user-avatar [user]="user()" [size]="52" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[17px] font-bold">{{ user()?.displayName || user()?.email }}</p>
          <p class="truncate text-[13px] font-semibold text-on-surface-variant">
            {{ user()?.email }} · {{ provider() }}
          </p>
        </div>
        <button
          matIconButton
          type="button"
          class="text-on-surface-variant"
          aria-label="Sign out"
          i18n-aria-label
          (click)="signOut()"
        >
          <app-icon name="logout" />
        </button>
      </section>

      <section aria-labelledby="appearance-title" class="app-card">
        <h2 id="appearance-title" class="app-title-card mb-4" i18n>Appearance</h2>
        <app-segmented
          aria-labelledby="appearance-title"
          inset
          stretch
          [value]="theme.preference()"
          (valueChange)="setTheme($event)"
        >
          <app-segment value="light"
            ><ng-container i18n="Light theme">Light</ng-container></app-segment
          >
          <app-segment value="dark"
            ><ng-container i18n="Dark theme">Dark</ng-container></app-segment
          >
          <app-segment value="system"
            ><ng-container i18n="Theme follows the device">System</ng-container></app-segment
          >
        </app-segmented>
      </section>

      <section aria-labelledby="language-title" class="app-card">
        <h2 id="language-title" class="app-title-card mb-4" i18n>Language</h2>
        <app-segmented
          aria-labelledby="language-title"
          inset
          stretch
          [value]="language"
          (valueChange)="setLanguage($event)"
        >
          <!-- Each language is named in itself, so it can be found whatever the current one. -->
          <app-segment value="en" lang="en">English</app-segment>
          <app-segment value="cs" lang="cs">Čeština</app-segment>
        </app-segmented>
        <p class="mt-2.5 text-[13px] leading-relaxed font-medium text-on-surface-variant" i18n>
          The app reloads in the chosen language.
        </p>
      </section>

      <section aria-labelledby="help-title" class="app-card">
        <h2 id="help-title" class="app-title-card mb-4" i18n>Help</h2>
        <mat-slide-toggle
          class="app-switch-row"
          labelPosition="before"
          [checked]="settings().termHints"
          [disabled]="!settingsService.loaded()"
          (change)="save({ termHints: $event.checked })"
        >
          <ng-container i18n>Show term explanations</ng-container>
        </mat-slide-toggle>
        <p class="mt-1 text-[13px] leading-relaxed font-medium text-on-surface-variant" i18n>
          An ⓘ button next to terms such as EPS or P/E explains them in plain words.
        </p>
      </section>

      <section aria-labelledby="numbers-title" class="app-card">
        <h2 id="numbers-title" class="app-title-card mb-4" i18n>Numbers</h2>
        <mat-slide-toggle
          class="app-switch-row"
          labelPosition="before"
          [checked]="settings().roundNumbers"
          [disabled]="!settingsService.loaded()"
          (change)="save({ roundNumbers: $event.checked })"
        >
          <ng-container i18n>Round numbers</ng-container>
        </mat-slide-toggle>
        <p class="mt-1 text-[13px] leading-relaxed font-medium text-on-surface-variant" i18n>
          Show amounts and percentages without decimals. Only the display is rounded; calculations stay exact.
        </p>
      </section>

      <section aria-labelledby="notifications-title" class="app-card">
        <h2 id="notifications-title" class="app-title-card mb-4" i18n>Notifications</h2>
        @if (settingsService.error()) {
          <app-error-state
            compact
            message="Couldn't load your settings from the database."
            i18n-message
            (retry)="settingsService.retry()"
          />
        } @else if (!settingsService.loaded()) {
          <div class="space-y-3" aria-hidden="true">
            <app-skeleton class="h-6 w-48" />
            <app-skeleton class="h-14 w-full" />
            <app-skeleton class="h-14 w-full" />
          </div>
        } @else {
          <mat-slide-toggle
            class="app-switch-row mb-3"
            labelPosition="before"
            [checked]="settings().notificationsEnabled"
            (change)="save({ notificationsEnabled: $event.checked })"
          >
            <ng-container i18n>Email digest</ng-container>
          </mat-slide-toggle>
          @if (settings().notificationsEnabled) {
          <p class="text-[13px] leading-relaxed font-medium text-on-surface-variant" i18n>
            Sent every Sunday at 20:00 (Prague time) when a followed stock reports within the coming week.
          </p>
          }
        }
      </section>

      <app-t212-settings id="trading212" class="block scroll-mt-20" />

      <section aria-labelledby="about-title" class="app-card text-sm">
        <h2 id="about-title" class="app-title-card mb-4" i18n>About</h2>
        <dl class="space-y-3 leading-relaxed">
          <div>
            <dt class="app-label" i18n>Version</dt>
            <dd>Tradiqo {{ version }}</dd>
            <button
              matButton="outlined"
              type="button"
              class="mt-2"
              [disabled]="updating()"
              (click)="forceUpdate()"
              i18n
            >
              Update now
            </button>
          </div>
          <div>
            <dt class="app-label" i18n>Data sources</dt>
            <dd i18n>Finnhub, Twelve Data, Yahoo Finance and Financial Modeling Prep.</dd>
          </div>
          <div>
            <dt class="app-label" i18n>Charts</dt>
            <dd>
              <a
                href="https://www.tradingview.com/"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary underline"
                >TradingView Lightweight Charts™</a
              >
              (Apache 2.0), © TradingView, Inc.
            </dd>
          </div>
          <div>
            <dt class="app-label" i18n>Company logos</dt>
            <dd>
              <a
                href="https://elbstream.com/logos"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary underline"
                >Elbstream</a
              >
              (Parqet Logo API), Finnhub
            </dd>
          </div>
          <div>
            <dt class="app-label" i18n>Icons</dt>
            <dd i18n>Lucide (ISC).</dd>
          </div>
        </dl>
        <p
          class="mt-4 rounded-2xl bg-surface-container-high p-3 text-xs font-semibold text-on-surface-variant"
          i18n
        >
          Data may be delayed; not investment advice.
        </p>
      </section>
    </div>
  `,
})
export class SettingsPage {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly notifier = inject(NotifierService);
  protected readonly settingsService = inject(SettingsService);
  protected readonly theme = inject(ThemeService);

  private readonly swUpdate = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);

  protected readonly version = APP_VERSION;
  protected readonly updating = signal(false);
  protected readonly language = LANGUAGE;
  protected readonly user = this.auth.user;
  protected readonly settings = this.settingsService.settings;

  protected readonly provider = computed(() => providerLabel(this.user()));

  protected setTheme(theme: ThemePreference): void {
    this.settingsService
      .setTheme(theme)
      .catch(() => void this.notifier.show($localize`Couldn't save the theme`));
  }

  /** Saved to the account (so other devices follow), then the app reloads in the new language. */
  protected async setLanguage(language: Language): Promise<void> {
    try {
      await this.settingsService.update({ language });
    } catch {
      // Still switch on this device.
    }
    switchLanguage(language);
  }

  protected save(patch: Partial<UserSettings>): void {
    this.settingsService
      .update(patch)
      .catch(() => void this.notifier.show($localize`Couldn't save the setting`));
  }

  /**
   * Fetches the newest deploy right away instead of waiting for the background check, then reloads into it. Without
   * a service worker (dev, mock mode) a plain reload already gets the newest files.
   */
  protected async forceUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      this.document.location.reload();
      return;
    }
    this.updating.set(true);
    try {
      if (await this.swUpdate.checkForUpdate()) {
        await this.swUpdate.activateUpdate();
        this.document.location.reload();
        return;
      }
      void this.notifier.show($localize`You have the latest version.`);
    } catch {
      void this.notifier.show($localize`Couldn't check for updates`);
    }
    this.updating.set(false);
  }

  protected signOut(): void {
    void this.session.signOut();
  }
}
