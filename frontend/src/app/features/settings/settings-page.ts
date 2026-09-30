import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { errorMessage, toApiError } from '../../core/api/api-error';
import { ApiService } from '../../core/api/api.service';
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
import { Icon } from '../../shared/icon/icon';

/** `/settings`: account, theme, the email digest (stored in `users/{uid}.settings`), a test email, and About. */
@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    MatButton,
    MatButtonToggleGroup,
    MatButtonToggle,
    MatSlideToggle,
    MatFormField,
    MatLabel,
    MatInput,
    MatHint,
    MatError,
    MatSelect,
    MatOption,
    PageHeader,
    ErrorState,
    Skeleton,
    Icon,
  ],
  template: `
    <app-page-header title="Settings" i18n-title />
    <div class="mx-auto max-w-2xl space-y-4 px-4 pt-2 pb-10">
      <section aria-labelledby="account-title" class="rounded-3xl bg-surface-container-low p-4">
        <h2 id="account-title" class="mb-3 text-sm font-semibold text-on-surface-variant" i18n>
          Account
        </h2>
        <div class="flex items-center gap-3">
          @if (user()?.photoUrl && !avatarFailed()) {
            <img
              [src]="user()!.photoUrl"
              alt=""
              width="48"
              height="48"
              referrerpolicy="no-referrer"
              class="size-12 rounded-full"
              (error)="avatarFailed.set(true)"
            />
          } @else {
            <span
              class="flex size-12 items-center justify-center rounded-full bg-primary-container text-lg font-semibold text-on-primary-container"
              aria-hidden="true"
              >{{ initials() }}</span
            >
          }
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ user()?.displayName || user()?.email }}</p>
            <p class="truncate text-sm text-on-surface-variant">
              {{ user()?.email }} · {{ provider() }}
            </p>
          </div>
        </div>
        <button matButton="outlined" type="button" class="mt-4" (click)="signOut()">
          <app-icon matButtonIcon name="logout" [size]="18" />
          <ng-container i18n>Sign out</ng-container>
        </button>
      </section>

      <section aria-labelledby="appearance-title" class="rounded-3xl bg-surface-container-low p-4">
        <h2 id="appearance-title" class="mb-3 text-sm font-semibold text-on-surface-variant" i18n>
          Appearance
        </h2>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          aria-labelledby="appearance-title"
          class="w-full sm:w-auto"
          [value]="theme.preference()"
          (change)="setTheme($event.value)"
        >
          <mat-button-toggle value="light" class="flex-1"
            ><app-icon name="light_mode" [size]="18" class="mr-1.5 align-middle" /><ng-container
              i18n="Light theme"
              >Light</ng-container
            ></mat-button-toggle
          >
          <mat-button-toggle value="dark" class="flex-1"
            ><app-icon name="dark_mode" [size]="18" class="mr-1.5 align-middle" /><ng-container
              i18n="Dark theme"
              >Dark</ng-container
            ></mat-button-toggle
          >
          <mat-button-toggle value="system" class="flex-1"
            ><app-icon name="contrast" [size]="18" class="mr-1.5 align-middle" /><ng-container
              i18n="Theme follows the device"
              >System</ng-container
            ></mat-button-toggle
          >
        </mat-button-toggle-group>
      </section>

      <section aria-labelledby="language-title" class="rounded-3xl bg-surface-container-low p-4">
        <h2 id="language-title" class="mb-3 text-sm font-semibold text-on-surface-variant" i18n>
          Language
        </h2>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          aria-labelledby="language-title"
          class="w-full sm:w-auto"
          [value]="language"
          (change)="setLanguage($event.value)"
        >
          <!-- Each language is named in itself, so it can be found whatever the current one. -->
          <mat-button-toggle value="en" class="flex-1" lang="en">English</mat-button-toggle>
          <mat-button-toggle value="cs" class="flex-1" lang="cs">Čeština</mat-button-toggle>
        </mat-button-toggle-group>
        <p class="mt-2 text-xs text-on-surface-variant" i18n>
          The app reloads in the chosen language.
        </p>
      </section>

      <section aria-labelledby="help-title" class="rounded-3xl bg-surface-container-low p-4">
        <h2 id="help-title" class="mb-3 text-sm font-semibold text-on-surface-variant" i18n>
          Help
        </h2>
        <mat-slide-toggle
          [checked]="settings().termHints"
          [disabled]="!settingsService.loaded()"
          (change)="save({ termHints: $event.checked })"
        >
          <ng-container i18n>Show term explanations</ng-container>
        </mat-slide-toggle>
        <p class="mt-2 text-xs text-on-surface-variant" i18n>
          An ⓘ button next to terms such as EPS or P/E explains them in plain words.
        </p>
      </section>

      <section
        aria-labelledby="notifications-title"
        class="rounded-3xl bg-surface-container-low p-4"
      >
        <h2
          id="notifications-title"
          class="mb-3 text-sm font-semibold text-on-surface-variant"
          i18n
        >
          Notifications
        </h2>
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
            class="mb-4"
            [checked]="settings().notificationsEnabled"
            (change)="save({ notificationsEnabled: $event.checked })"
          >
            <ng-container i18n>Email digest</ng-container>
          </mat-slide-toggle>
          <div class="flex flex-col gap-1">
            <mat-form-field appearance="outline">
              <mat-label i18n>Notify me</mat-label>
              <mat-select
                [value]="settings().notifyDaysBefore"
                [disabled]="!settings().notificationsEnabled"
                (selectionChange)="save({ notifyDaysBefore: $event.value })"
              >
                @for (n of dayOptions; track n) {
                  <mat-option [value]="n" i18n>{n, plural,
                    =1 {1 day before}
                    other {{{ n }} days before}
                  }</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label i18n>Notification email (optional)</mat-label>
              <input
                matInput
                type="email"
                inputmode="email"
                autocomplete="email"
                [formControl]="email"
                [placeholder]="user()?.email ?? ''"
                (blur)="saveEmail()"
                (keydown.enter)="saveEmail()"
              />
              <mat-hint i18n>Empty = your account email</mat-hint>
              <mat-error i18n>Enter a valid email address.</mat-error>
            </mat-form-field>
          </div>
          <p class="mt-2 text-sm text-on-surface-variant" i18n>
            Sent daily at 12:00 (Prague time) when a followed stock reports within this window.
          </p>
          <button
            matButton="tonal"
            type="button"
            class="mt-4"
            [disabled]="sending()"
            (click)="sendTest()"
          >
            <app-icon matButtonIcon name="send" [size]="18" />
            @if (sending()) {
              <ng-container i18n>Sending…</ng-container>
            } @else {
              <ng-container i18n>Send test email</ng-container>
            }
          </button>
        }
      </section>

      <section
        aria-labelledby="about-title"
        class="rounded-3xl bg-surface-container-low p-4 text-sm"
      >
        <h2 id="about-title" class="mb-3 text-sm font-semibold text-on-surface-variant" i18n>
          About
        </h2>
        <dl class="space-y-3">
          <div>
            <dt class="text-xs text-on-surface-variant" i18n>Version</dt>
            <dd>Earnings Tracker {{ version }}</dd>
          </div>
          <div>
            <dt class="text-xs text-on-surface-variant" i18n>Data sources</dt>
            <dd i18n>Finnhub, Twelve Data, Yahoo Finance and Financial Modeling Prep.</dd>
          </div>
          <div>
            <dt class="text-xs text-on-surface-variant" i18n>Charts</dt>
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
            <dt class="text-xs text-on-surface-variant" i18n>Icons</dt>
            <dd i18n>Material Symbols by Google (Apache 2.0).</dd>
          </div>
        </dl>
        <p
          class="mt-4 rounded-2xl bg-surface-container-high p-3 text-xs text-on-surface-variant"
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
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly notifier = inject(NotifierService);
  protected readonly settingsService = inject(SettingsService);
  protected readonly theme = inject(ThemeService);

  protected readonly version = APP_VERSION;
  protected readonly language = LANGUAGE;
  protected readonly dayOptions = [1, 2, 3, 4, 5, 6, 7];
  protected readonly user = this.auth.user;
  protected readonly settings = this.settingsService.settings;
  protected readonly avatarFailed = signal(false);
  protected readonly sending = signal(false);
  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });

  protected readonly initials = computed(() => {
    const u = this.user();
    const source = u?.displayName || u?.email || '?';
    return source
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
  });
  protected readonly provider = computed(() => {
    const providers = this.user()?.providers ?? [];
    if (providers.includes('google.com')) return 'Google';
    if (providers.includes('password')) return $localize`Email and password`;
    return $localize`Signed in`;
  });

  constructor() {
    // Show the stored address (also when it changes on another device), unless the user is editing it.
    effect(() => {
      const stored = this.settings().notificationEmail ?? '';
      untracked(() => {
        if (!this.email.dirty) this.email.setValue(stored);
      });
    });
  }

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

  protected saveEmail(): void {
    if (this.email.invalid) return;
    const value = this.email.value.trim() || null;
    this.email.markAsPristine();
    if (value === this.settings().notificationEmail) return;
    this.settingsService
      .update({ notificationEmail: value })
      .then(() =>
        this.notifier.show(
          value
            ? $localize`Digest will go to ${value}:email:`
            : $localize`Digest will go to your account email`,
        ),
      )
      .catch(() => this.notifier.show($localize`Couldn't save the email address`));
  }

  protected async sendTest(): Promise<void> {
    this.sending.set(true);
    try {
      const { sentTo } = await firstValueFrom(this.api.sendTestEmail());
      await this.notifier.show($localize`Test email sent to ${sentTo}:email:`);
    } catch (error) {
      const code = toApiError(error).code;
      const message =
        code === 'RATE_LIMITED'
          ? $localize`You can send one test email per minute.`
          : code === 'UPSTREAM_UNAVAILABLE'
            ? $localize`The server couldn't send email right now.`
            : errorMessage(error);
      await this.notifier.show(message);
    } finally {
      this.sending.set(false);
    }
  }

  protected signOut(): void {
    void this.session.signOut();
  }
}
