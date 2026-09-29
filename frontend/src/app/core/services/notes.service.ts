import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { UserDataGateway } from '../data/user-data.gateway';
import { NOTE_MAX_LENGTH, NoteDoc } from '../models/user-data';

/** Private notes per stock: `users/{uid}/notes/{symbol}` (read once per page, no listener). */
@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly gateway = inject(UserDataGateway);
  private readonly auth = inject(AuthService);

  async load(symbol: string): Promise<NoteDoc | null> {
    const uid = this.auth.user()?.uid;
    return uid ? this.gateway.getNote(uid, symbol) : null;
  }

  async save(symbol: string, text: string): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) throw new Error('Not signed in');
    await this.gateway.saveNote(uid, symbol, text.slice(0, NOTE_MAX_LENGTH));
  }
}
