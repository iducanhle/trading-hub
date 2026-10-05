import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isApiError } from '../api/api-error';
import { ApiService } from '../api/api.service';
import { T212CredentialsRequest, T212Status } from '../models/contract';

const POLL_MS = 3000;
/** Matches the server's live-cache-ttl: asking more often would only get the same copy back. */
const LIVE_POLL_MS = 60_000;
/** Opening the portfolio starts a history sync when the last one is older than this. */
const STALE_SYNC_MS = 15 * 60_000;
/** A live refetch keeps the refresh indicator up at least this long, so a fast answer doesn't just flicker. */
const MIN_LIVE_INDICATOR_MS = 600;

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
  /** Bumped about once a minute while `watchLive` runs; live views refetch quietly (no skeleton). */
  readonly liveTick = signal(0);
  private readonly liveRequests = signal(0);

  readonly loaded = computed(() => this.status() !== null || this.error() !== null);
  readonly connected = computed(() => this.status()?.connected === true);
  readonly syncing = computed(() => this.status()?.syncState === 'RUNNING');
  /** A live view is refetching after a `liveTick`; the page shows the pull-to-refresh indicator meanwhile. */
  readonly liveRefreshing = computed(() => this.liveRequests() > 0);
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

  /** Loads the status and starts a history sync if the last one is stale. Never throws; Sync now reports errors. */
  async syncIfStale(maxAgeMs = STALE_SYNC_MS): Promise<void> {
    await this.load(true);
    const status = this.status();
    if (!status?.connected || status.syncState === 'RUNNING' || status.credentialsValid === false)
      return;
    const last = status.lastSyncAt ? Date.parse(status.lastSyncAt) : 0;
    if (Date.now() - last < maxAgeMs) return;
    try {
      await this.sync();
    } catch {
      // The manual button surfaces errors; opening the page should not.
    }
  }

  /**
   * Bumps `liveTick` every minute while the tab is visible and connected, and right away when the tab becomes
   * visible after a longer pause. Not while a sync runs or the key is rejected. Returns the stop function.
   */
  watchLive(): () => void {
    let last = Date.now();
    const tick = () => {
      const status = this.status();
      if (document.hidden || !status?.connected || status.credentialsValid === false) return;
      if (status.syncState === 'RUNNING') return;
      last = Date.now();
      this.liveTick.update((v) => v + 1);
    };
    const onVisible = () => {
      if (!document.hidden && Date.now() - last >= LIVE_POLL_MS) tick();
    };
    const timer = setInterval(tick, LIVE_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  /** Runs a live refetch while `liveRefreshing` reports it (held for at least MIN_LIVE_INDICATOR_MS). */
  trackLive<T>(request: Promise<T>): Promise<T> {
    this.liveRequests.update((n) => n + 1);
    const minimum = new Promise((resolve) => setTimeout(resolve, MIN_LIVE_INDICATOR_MS));
    void Promise.allSettled([request, minimum]).then(() => this.liveRequests.update((n) => n - 1));
    return request;
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
