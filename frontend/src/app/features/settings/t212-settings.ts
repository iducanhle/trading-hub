import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { errorMessage, toApiError } from '../../core/api/api-error';
import { T212Environment } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { T212Service } from '../../core/services/t212.service';
import { confirmInDialog } from '../../shared/components/confirm-sheet/confirm-sheet';
import { ErrorState } from '../../shared/components/error-state/error-state';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { Icon } from '../../shared/icon/icon';
import { DateTimePipe } from '../../shared/pipes/format.pipes';
import { openT212Guide } from './t212-guide';

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
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatSuffix,
    ErrorState,
    Skeleton,
    Icon,
    DateTimePipe,
  ],
  styles: `
    /* Three equal buttons in one row: icon above a short label, so Czech labels fit at 360 px. */
    .actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .actions .mat-mdc-button-base {
      flex-direction: column;
      gap: 4px;
      height: auto;
      min-height: 64px;
      border-radius: 16px;
      padding: 10px 4px;
      font-size: 13px;
      line-height: 1.2;
      white-space: normal;
    }
    .actions [matButtonIcon] {
      margin: 0;
    }
    .danger {
      --mat-button-tonal-container-color: var(--mat-sys-error-container);
      --mat-button-tonal-label-text-color: var(--mat-sys-on-error-container);
    }
  `,
  template: `
    <section aria-labelledby="t212-title" class="app-card">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 id="t212-title" class="app-title-card">Trading 212</h2>
        @if (status()?.connected) {
          <span
            class="app-pill"
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
        <div class="actions mt-4">
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
            matButton="tonal"
            type="button"
            class="danger"
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
          stock.
        </p>
        <p class="mt-3 flex gap-2 rounded-2xl bg-gain-container p-3 text-sm text-on-surface">
          <app-icon name="shield" [size]="18" class="shrink-0 text-gain" />
          <ng-container i18n
            >Read-only: Tradiqo can see your account, but it can never trade or move
            money.</ng-container
          >
        </p>
        <button matButton="tonal" type="button" class="mt-3" (click)="openGuide()">
          <app-icon matButtonIcon name="info" [size]="18" />
          <ng-container i18n>How do I get a key?</ng-container>
        </button>

        <form class="mt-4 flex flex-col gap-1" (submit)="$event.preventDefault(); connect()">
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
          </mat-form-field>
          @if (formError()) {
            <p role="alert" class="mt-1 text-sm text-error">{{ formError() }}</p>
          }
          <div class="mt-5 grid auto-cols-fr grid-flow-col gap-2">
            @if (replacing()) {
              <button
                matButton="tonal"
                type="button"
                [disabled]="busy()"
                (click)="cancelReplace()"
                i18n
              >
                Cancel
              </button>
            }
            <button matButton="filled" type="submit" [disabled]="busy()">
              <app-icon matButtonIcon name="account_balance_wallet" [size]="18" />
              @if (busy()) {
                <ng-container i18n>Checking the key…</ng-container>
              } @else {
                <ng-container i18n>Connect</ng-container>
              }
            </button>
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
  private readonly dialog = inject(MatDialog);
  private readonly sheet = inject(MatBottomSheet);

  protected readonly status = this.t212.status;
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

  protected openGuide(): void {
    openT212Guide(this.sheet, this.status()?.serverIpHint ?? null);
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
      // Demo (paper trading) accounts are not offered: the app is for real portfolios.
      environment: 'LIVE' as T212Environment,
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
    this.formError.set(null);
    this.replacing.set(true);
  }

  protected cancelReplace(): void {
    this.clearForm();
    this.formError.set(null);
    this.replacing.set(false);
  }

  protected async disconnect(): Promise<void> {
    const confirmed = await confirmInDialog(this.dialog, {
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
      return $localize`Trading 212 rejected the key. Check the key, the secret and the key's IP restriction.`;
    case 'T212_MISSING_PERMISSIONS': {
      const permissions = /permissions: ([^.]+)\./.exec(e.message)?.[1];
      return permissions
        ? $localize`The key is missing these permissions: ${permissions}:permissions:. Generate a new key with them.`
        : $localize`The key is missing a permission the app needs. Generate a new key with the permissions from the guide.`;
    }
    case 'BAD_REQUEST':
      return $localize`Check the key and the secret: they look incomplete.`;
    default:
      return errorMessage(error);
  }
}
