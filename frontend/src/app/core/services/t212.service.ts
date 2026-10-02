import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isApiError } from '../api/api-error';
import { ApiService } from '../api/api.service';
import { T212CredentialsRequest, T212Status } from '../models/contract';

const POLL_MS = 3000;

/**
 * The caller's Trading 212 connection: status (polled while a sync runs), connect, disconnect and sync. When a
 * sync finishes or the key changes, `dataVersion` goes up and the cached Trading 212 responses are dropped, so
 * pages that read it refetch.
 */
@Injectable({ providedIn: 'root' })
export class T212Service {
  private readonly api = inject(ApiService);
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private loadingPromise: Promise<void> | null = null;

  readonly status = signal<T212Status | null>(null);
  readonly error = signal<unknown>(null);
  /** Bumped whenever the synced data may have changed. */
  readonly dataVersion = signal(0);

  readonly loaded = computed(() => this.status() !== null || this.error() !== null);
  readonly connected = computed(() => this.status()?.connected === true);
  readonly syncing = computed(() => this.status()?.syncState === 'RUNNING');
  /** The server has no T212_ENCRYPTION_KEY: the feature is off there. */
  readonly notConfigured = computed(() => isApiError(this.error(), 'T212_NOT_CONFIGURED'));

  /** Loads the status once (later calls reuse it); `force` asks the server again. */
  load(force = false): Promise<void> {
    if (!force && this.status()) return Promise.resolve();
    if (!force && this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = firstValueFrom(this.api.t212Status({ force: true }))
      .then(
        (status) => this.apply(status),
        (error: unknown) => {
          this.status.set(null);
          this.error.set(error);
        },
      )
      .finally(() => (this.loadingPromise = null));
    return this.loadingPromise;
  }

  /** Checks the key with Trading 212 and stores it on the server; the first sync starts there. */
  async connect(request: T212CredentialsRequest): Promise<void> {
    const status = await firstValueFrom(this.api.t212Connect(request));
    this.dataChanged();
    this.apply(status);
  }

  /** Deletes the key and all synced data on the server. */
  async disconnect(): Promise<void> {
    await firstValueFrom(this.api.t212Disconnect());
    this.dataChanged();
    await this.load(true);
  }

  async sync(): Promise<void> {
    this.apply(await firstValueFrom(this.api.t212Sync()));
  }

  /** Sign-out: forget everything about the previous user. */
  reset(): void {
    clearTimeout(this.pollTimer);
    this.status.set(null);
    this.error.set(null);
  }

  private apply(status: T212Status): void {
    const wasSyncing = this.status()?.syncState === 'RUNNING';
    this.status.set(status);
    this.error.set(null);
    if (wasSyncing && status.syncState !== 'RUNNING') this.dataChanged();
    clearTimeout(this.pollTimer);
    if (status.syncState === 'RUNNING') {
      this.pollTimer = setTimeout(() => void this.load(true), POLL_MS);
    }
  }

  private dataChanged(): void {
    this.api.clearT212Cache();
    this.dataVersion.update((v) => v + 1);
  }
}
