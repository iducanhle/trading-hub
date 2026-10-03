import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { errorMessage, toApiError } from '../../core/api/api-error';
import { T212Environment } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { T212Service } from '../../core/services/t212.service';
import { confirmInSheet } from '../../shared/components/confirm-sheet/confirm-sheet';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Icon } from '../../shared/icon/icon';
import { DateTimePipe } from '../../shared/pipes/format.pipes';
import { Segment, Segmented } from '../../shared/components/segmented/segmented';

/**
 * Settings → Trading 212: connect with an API key (sent once to the backend, stored there encrypted, never kept
 * in the browser), then see the connection and sync state, sync, replace the key or disconnect.
 */
@Component({
  selector: 'app-t212-settings',
  imports: [
    ReactiveFormsModule,
    MatButton,
    MatIconButton,
    Segmented,
    Segment,
    MatFormField,
    MatLabel,
    MatInput,
    MatHint,
    MatError,
    MatSuffix,
    ErrorState,
    Skeleton,
    Icon,
    DateTimePipe,
  ],
  styles: `
    .danger-text {
      --mat-button-text-label-text-color: var(--mat-sys-error);
    }
  `,
  template: `
    <section aria-labelledby="t212-title" class="app-card">
      <div class="mb-2 flex items-center justify-between gap-3">
        <h2 id="t212-title" class="app-label">Trading 212</h2>
        @if (status()?.connected) {
          <span
            class="rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-[.04em] uppercase"
            [class]="
              status()!.credentialsValid === false
                ? 'bg-error-container text-on-error-container'
                : 'bg-gain-container text-gain'
            "
            >● <ng-container i18n="Trading 212 connection status">Connected</ng-container></span
          >
        }
      </div>

      @if (!t212.loaded()) {
        <div class="space-y-3" aria-hidden="true">
          <app-skeleton class="h-5 w-56" />
          <app-skeleton class="h-10 w-full" />
        </div>
      } @else if (t212.notConfigured()) {
        <p class="text-sm text-on-surface-variant" i18n>
          Trading 212 isn't available on this server yet: it needs an encryption key for the API
          keys (T212_ENCRYPTION_KEY, see the deployment guide).
        </p>
      } @else if (t212.error()) {
        <app-error-state compact [error]="t212.error()" (retry)="t212.load(true)" />
      } @else if (status()?.connected && !replacing()) {
        @let s = status()!;
        @if (s.credentialsValid === false) {
          <div
            role="alert"
            class="mb-4 flex gap-3 rounded-2xl bg-error-container p-3 text-sm text-on-error-container"
          >
            <app-icon name="warning" [size]="20" class="shrink-0" />
            <div>
              <p class="font-medium" i18n>The key no longer works.</p>
              <p>{{ s.lastError?.message }}</p>
            </div>
          </div>
        }
        <dl class="divide-y divide-outline-variant text-[15px] font-semibold">
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Account</dt>
            <dd class="text-right">
              @if (s.environment === 'DEMO') {
                <ng-container i18n="Trading 212 paper-trading account"
                  >Demo (paper trading)</ng-container
                >
              } @else {
                <ng-container i18n="Trading 212 real-money account">Live</ng-container>
              }
              @if (s.accountCurrency) {
                · {{ s.accountCurrency }}
              }
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>API key</dt>
            <dd class="text-right">•••• {{ s.keyHint || '' }}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 py-2.5">
            <dt class="app-label" i18n>Last sync</dt>
            <dd class="text-right">
              @if (s.syncState === 'RUNNING') {
                <span class="inline-flex items-center gap-1.5" role="status">
                  <app-icon name="sync" [size]="16" class="animate-spin" />
                  <ng-container i18n>Syncing…</ng-container>
                </span>
              } @else if (s.lastSyncAt) {
                {{ s.lastSyncAt | dateTime }}
              } @else {
                <ng-container i18n>Not yet</ng-container>
              }
            </dd>
          </div>
          @if (s.syncState === 'FAILED' && s.credentialsValid !== false) {
            <div class="flex items-baseline justify-between gap-3 py-2.5">
              <dt class="app-label" i18n>Last attempt</dt>
              <dd class="text-right text-error">{{ s.lastError?.message }}</dd>
            </div>
          }
        </dl>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            matButton="filled"
            type="button"
            [disabled]="t212.syncing() || busy() || s.credentialsValid === false"
            (click)="syncNow()"
          >
            <app-icon matButtonIcon name="sync" [size]="18" />
            <ng-container i18n>Sync now</ng-container>
          </button>
          <button matButton="tonal" type="button" [disabled]="busy()" (click)="startReplace()">
            <app-icon matButtonIcon name="key" [size]="18" />
            <ng-container i18n>Replace key</ng-container>
          </button>
          <button
            matButton
            type="button"
            class="danger-text"
            [disabled]="busy()"
            (click)="disconnect()"
          >
            <app-icon matButtonIcon name="link_off" [size]="18" />
            <ng-container i18n>Disconnect</ng-container>
          </button>
        </div>
      } @else {
        <p class="text-sm" i18n>
          Connect your Trading 212 account to see your trades and how much you made or lost on each
          stock. The app only reads your account; it can't trade.
        </p>
        <ol class="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-on-surface-variant">
          <li i18n>In the Trading 212 app: ☰ → Settings → API (Beta) → Generate API key.</li>
          <li i18n>
            Permissions: turn on account data, portfolio, history (orders, dividends, transactions)
            and metadata. Leave orders and pies off.
          </li>
          <li>
            @if (status()?.serverIpHint; as ip) {
              <ng-container i18n
                >IP access: choose "Restrict access to trusted IPs" and enter
                <span class="font-mono text-on-surface">{{ ip }}</span
                >, the server's address.</ng-container
              >
            } @else {
              <ng-container i18n
                >IP access: restricting the key to the server's IP address is
                recommended.</ng-container
              >
            }
          </li>
          <li i18n>Copy the key and the secret here. The secret is shown only once.</li>
        </ol>

        <form class="mt-4 flex flex-col gap-1" (submit)="$event.preventDefault(); connect()">
          <app-segmented
            aria-label="Account type"
            i18n-aria-label
            class="mb-3"
            inset
            stretch
            [value]="environment()"
            (valueChange)="environment.set($event)"
          >
            <app-segment value="LIVE" i18n="Trading 212 real-money account">Live</app-segment>
            <app-segment value="DEMO" i18n="Trading 212 paper-trading account"
              >Demo (paper trading)</app-segment
            >
          </app-segmented>
          <mat-form-field appearance="fill">
            <mat-label i18n>API key</mat-label>
            <input
              matInput
              [type]="showKey() ? 'text' : 'password'"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              [formControl]="apiKey"
            />
            <button
              matIconButton
              matSuffix
              type="button"
              [attr.aria-label]="showKey() ? labels.hide : labels.show"
              [attr.aria-pressed]="showKey()"
              (click)="showKey.set(!showKey())"
            >
              <app-icon [name]="showKey() ? 'visibility_off' : 'visibility'" />
            </button>
            <mat-error i18n>Enter the API key.</mat-error>
          </mat-form-field>
          <mat-form-field appearance="fill">
            <mat-label i18n>API secret</mat-label>
            <input
              matInput
              [type]="showSecret() ? 'text' : 'password'"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              [formControl]="apiSecret"
            />
            <button
              matIconButton
              matSuffix
              type="button"
              [attr.aria-label]="showSecret() ? labels.hide : labels.show"
              [attr.aria-pressed]="showSecret()"
              (click)="showSecret.set(!showSecret())"
            >
              <app-icon [name]="showSecret() ? 'visibility_off' : 'visibility'" />
            </button>
            <mat-hint i18n>Leave empty only for an old key without a secret.</mat-hint>
          </mat-form-field>
          @if (formError()) {
            <p role="alert" class="mt-1 text-sm text-error">{{ formError() }}</p>
          }
          <div class="mt-3 flex flex-wrap gap-2">
            <button matButton="filled" type="submit" [disabled]="busy()">
              <app-icon matButtonIcon name="account_balance_wallet" [size]="18" />
              @if (busy()) {
                <ng-container i18n>Checking the key…</ng-container>
              } @else {
                <ng-container i18n>Connect</ng-container>
              }
            </button>
            @if (replacing()) {
              <button matButton type="button" [disabled]="busy()" (click)="cancelReplace()" i18n>
                Cancel
              </button>
            }
          </div>
          <p class="mt-3 flex gap-2 text-xs text-on-surface-variant">
            <app-icon name="lock" [size]="16" class="shrink-0" />
            <ng-container i18n
              >The key is sent once to the app's server, stored there encrypted, and never shown
              again. This device doesn't keep it.</ng-container
            >
          </p>
        </form>
      }
    </section>
  `,
})
export class T212Settings {
  protected readonly t212 = inject(T212Service);
  private readonly notifier = inject(NotifierService);
  private readonly sheet = inject(MatBottomSheet);

  protected readonly status = this.t212.status;
  protected readonly environment = signal<T212Environment>('LIVE');
  protected readonly showKey = signal(false);
  protected readonly showSecret = signal(false);
  protected readonly replacing = signal(false);
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly apiKey = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly apiSecret = new FormControl('', { nonNullable: true });

  protected readonly labels = {
    show: $localize`Show`,
    hide: $localize`Hide`,
  };

  constructor() {
    void this.t212.load();
  }

  protected async connect(): Promise<void> {
    this.formError.set(null);
    if (this.apiKey.value.trim() === '') {
      this.apiKey.markAsTouched();
      return;
    }
    this.busy.set(true);
    const request = {
      apiKey: this.apiKey.value.trim(),
      apiSecret: this.apiSecret.value.trim() || null,
      environment: this.environment(),
    };
    // The key lives only in this request: the fields are cleared whatever the outcome.
    this.clearForm();
    try {
      await this.t212.connect(request);
      this.replacing.set(false);
      void this.notifier.show($localize`Trading 212 connected. The first sync has started.`);
    } catch (error) {
      this.formError.set(connectError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async syncNow(): Promise<void> {
    try {
      await this.t212.sync();
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    }
  }

  protected startReplace(): void {
    this.environment.set(this.status()?.environment ?? 'LIVE');
    this.formError.set(null);
    this.replacing.set(true);
  }

  protected cancelReplace(): void {
    this.clearForm();
    this.formError.set(null);
    this.replacing.set(false);
  }

  protected async disconnect(): Promise<void> {
    const confirmed = await confirmInSheet(this.sheet, {
      title: $localize`Disconnect Trading 212?`,
      message: $localize`The stored key and all synced trades, dividends and transactions are deleted from the app's server. Your Trading 212 account is not affected. You can connect again at any time.`,
      confirm: $localize`Disconnect`,
      danger: true,
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      await this.t212.disconnect();
      this.replacing.set(false);
      void this.notifier.show($localize`Trading 212 disconnected`);
    } catch (error) {
      void this.notifier.show(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private clearForm(): void {
    this.apiKey.reset('');
    this.apiSecret.reset('');
    this.showKey.set(false);
    this.showSecret.set(false);
  }
}

/** Connect errors in the user's language; the server's message is English. */
function connectError(error: unknown): string {
  const e = toApiError(error);
  switch (e.code) {
    case 'T212_INVALID_CREDENTIALS':
      return $localize`Trading 212 rejected the key. Check the key and the secret, Live or Demo, and the key's IP restriction.`;
    case 'T212_MISSING_PERMISSIONS': {
      const permissions = /permissions: ([^.]+)\./.exec(e.message)?.[1];
      return permissions
        ? $localize`The key is missing these permissions: ${permissions}:permissions:. Generate a new key with them.`
        : $localize`The key is missing a permission the app needs. Generate a new key with the permissions above.`;
    }
    case 'BAD_REQUEST':
      return $localize`Check the key and the secret: they look incomplete.`;
    default:
      return errorMessage(error);
  }
}
