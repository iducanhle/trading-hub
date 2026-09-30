import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { UserDataGateway } from '../data/user-data.gateway';
import { Region } from '../models/contract';
import { FollowDoc } from '../models/user-data';
import { NotifierService } from './notifier.service';

/** What a follow needs from a search result, an overview or a calendar event. */
export interface FollowTarget {
  symbol: string;
  name: string;
  exchange: string;
  region: Region;
  logoUrl: string | null;
}

/** `users/{uid}/follows`, live (other devices included), with optimistic follow / unfollow. */
@Injectable({ providedIn: 'root' })
export class FollowsService {
  private readonly gateway = inject(UserDataGateway);
  private readonly notifier = inject(NotifierService);
  private subscription?: Subscription;
  private uid: string | null = null;

  /** Newest first. */
  readonly follows = signal<FollowDoc[]>([]);
  readonly symbols = computed(() => new Set(this.follows().map((f) => f.symbol)));
  /** False until the first snapshot (or a failure). */
  readonly loaded = signal(false);
  /** Set when the listener failed, e.g. the Firestore rules refused this account. */
  readonly error = signal<unknown>(null);

  start(uid: string): void {
    if (this.uid === uid) return;
    this.stop();
    this.uid = uid;
    this.subscription = this.gateway.watchFollows(uid).subscribe({
      next: (follows) => {
        this.follows.set(sortNewestFirst(follows));
        this.error.set(null);
        this.loaded.set(true);
      },
      error: (error: unknown) => {
        console.error('Follows listener failed', error);
        this.error.set(error);
        this.loaded.set(true);
      },
    });
  }

  /** Starts the listener again after a failure. */
  retry(): void {
    const uid = this.uid;
    if (!uid) return;
    this.stop();
    this.start(uid);
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.uid = null;
    this.follows.set([]);
    this.error.set(null);
    this.loaded.set(false);
  }

  isFollowed(symbol: string): boolean {
    return this.symbols().has(symbol);
  }

  async follow(target: FollowTarget, followedAt: Date | null = null): Promise<void> {
    if (!this.uid) return;
    const doc: FollowDoc = {
      symbol: target.symbol,
      name: target.name,
      exchange: target.exchange,
      region: target.region,
      logoUrl: target.logoUrl,
      followedAt: followedAt ?? new Date(),
    };
    const previous = this.follows();
    this.follows.set(sortNewestFirst([...previous.filter((f) => f.symbol !== doc.symbol), doc]));
    try {
      await this.gateway.follow(this.uid, { ...doc, followedAt });
    } catch (error) {
      this.follows.set(previous);
      void this.notifier.show(`Couldn't follow ${target.symbol}`);
      throw error;
    }
  }

  /** Unfollows at once and offers Undo, which restores the original follow date. */
  async unfollow(symbol: string): Promise<void> {
    if (!this.uid) return;
    const previous = this.follows();
    const removed = previous.find((f) => f.symbol === symbol);
    this.follows.set(previous.filter((f) => f.symbol !== symbol));
    try {
      await this.gateway.unfollow(this.uid, symbol);
    } catch (error) {
      this.follows.set(previous);
      void this.notifier.show(`Couldn't unfollow ${symbol}`);
      throw error;
    }
    if (!removed) return;
    const ref = await this.notifier.show(`Unfollowed ${symbol}`, 'Undo');
    ref.onAction().subscribe(() => void this.follow(removed, removed.followedAt));
  }
}

function sortNewestFirst(follows: FollowDoc[]): FollowDoc[] {
  return [...follows].sort(
    (a, b) => (b.followedAt?.getTime() ?? Infinity) - (a.followedAt?.getTime() ?? Infinity),
  );
}
