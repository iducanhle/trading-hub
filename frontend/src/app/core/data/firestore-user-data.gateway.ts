import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { FirebaseService, FirestoreHandle } from '../firebase/firebase.service';
import { FollowDoc, NoteDoc, UserDoc, UserSettings } from '../models/user-data';
import { Converters, createConverters } from './firestore-converters';
import { NewFollow, UserDataGateway, UserDocSnapshot } from './user-data.gateway';

interface Handle extends FirestoreHandle {
  converters: Converters;
}

/** Firestore implementation. Listeners are used only for the user document and the follows (no polling). */
@Injectable()
export class FirestoreUserDataGateway extends UserDataGateway {
  private readonly firebase = inject(FirebaseService);
  private handlePromise?: Promise<Handle>;

  private handle(): Promise<Handle> {
    this.handlePromise ??= this.firebase
      .firestore()
      .then((firestore) => ({ ...firestore, converters: createConverters(firestore.sdk) }));
    return this.handlePromise;
  }

  /** Wraps an onSnapshot subscription in an Observable that also waits for the lazy SDK. */
  private listen<T>(
    subscribe: (
      handle: Handle,
      next: (value: T) => void,
      error: (e: unknown) => void,
    ) => () => void,
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      let unsubscribe: (() => void) | undefined;
      let closed = false;
      this.handle().then(
        (handle) => {
          if (closed) return;
          unsubscribe = subscribe(
            handle,
            (value) => subscriber.next(value),
            (error) => subscriber.error(error),
          );
        },
        (error: unknown) => subscriber.error(error),
      );
      return () => {
        closed = true;
        unsubscribe?.();
      };
    });
  }

  watchUser(uid: string): Observable<UserDocSnapshot> {
    return this.listen<UserDocSnapshot>(({ sdk, db, converters }, next, error) =>
      sdk.onSnapshot(
        sdk.doc(db, 'users', uid).withConverter(converters.user),
        (snap) => next({ doc: snap.data() ?? null, fromCache: snap.metadata.fromCache }),
        error,
      ),
    );
  }

  async createUser(uid: string, doc: Omit<UserDoc, 'createdAt'>): Promise<void> {
    const { sdk, db, converters } = await this.handle();
    await sdk.setDoc(sdk.doc(db, 'users', uid).withConverter(converters.user), {
      ...doc,
      createdAt: null,
    });
  }

  async updateSettings(uid: string, patch: Partial<UserSettings>): Promise<void> {
    const { sdk, db } = await this.handle();
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) fields[`settings.${key}`] = value;
    await sdk.updateDoc(sdk.doc(db, 'users', uid), fields);
  }

  watchFollows(uid: string): Observable<FollowDoc[]> {
    return this.listen<FollowDoc[]>(({ sdk, db, converters }, next, error) =>
      sdk.onSnapshot(
        sdk.collection(db, 'users', uid, 'follows').withConverter(converters.follow),
        (snap) => next(snap.docs.map((d) => d.data())),
        error,
      ),
    );
  }

  async follow(uid: string, follow: NewFollow): Promise<void> {
    const { sdk, db, converters } = await this.handle();
    const ref = sdk
      .doc(db, 'users', uid, 'follows', follow.symbol)
      .withConverter(converters.follow);
    await sdk.setDoc(ref, { ...follow, followedAt: follow.followedAt ?? null });
  }

  async unfollow(uid: string, symbol: string): Promise<void> {
    const { sdk, db } = await this.handle();
    await sdk.deleteDoc(sdk.doc(db, 'users', uid, 'follows', symbol));
  }

  async getNote(uid: string, symbol: string): Promise<NoteDoc | null> {
    const { sdk, db, converters } = await this.handle();
    const snap = await sdk.getDoc(
      sdk.doc(db, 'users', uid, 'notes', symbol).withConverter(converters.note),
    );
    return snap.data() ?? null;
  }

  async saveNote(uid: string, symbol: string, text: string): Promise<void> {
    const { sdk, db, converters } = await this.handle();
    const ref = sdk.doc(db, 'users', uid, 'notes', symbol).withConverter(converters.note);
    await sdk.setDoc(ref, { symbol, text, updatedAt: null });
  }
}
