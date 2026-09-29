import { Observable } from 'rxjs';
import { FollowDoc, NoteDoc, UserDoc, UserSettings } from '../models/user-data';

export interface UserDocSnapshot {
  doc: UserDoc | null;
  /** True when the value comes from the local cache and the server has not confirmed it yet. */
  fromCache: boolean;
}

export type NewFollow = Omit<FollowDoc, 'followedAt'> & { followedAt?: Date | null };

/**
 * Reads and writes the user-owned documents (`users/{uid}`, `follows`, `notes`).
 * Firestore in the app; an in-memory store in mock mode and in unit tests.
 */
export abstract class UserDataGateway {
  abstract watchUser(uid: string): Observable<UserDocSnapshot>;

  /** Creates `users/{uid}`; `createdAt` is the server time. */
  abstract createUser(uid: string, doc: Omit<UserDoc, 'createdAt'>): Promise<void>;

  abstract updateSettings(uid: string, patch: Partial<UserSettings>): Promise<void>;

  abstract watchFollows(uid: string): Observable<FollowDoc[]>;

  /** `followedAt` defaults to the server time (an Undo passes the original time back). */
  abstract follow(uid: string, follow: NewFollow): Promise<void>;

  abstract unfollow(uid: string, symbol: string): Promise<void>;

  abstract getNote(uid: string, symbol: string): Promise<NoteDoc | null>;

  abstract saveNote(uid: string, symbol: string, text: string): Promise<void>;
}
