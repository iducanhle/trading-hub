import { WritableSignal, effect, signal } from '@angular/core';
import { readLocal, writeLocal } from '../../core/services/local-store';

/** A signal whose value survives reloads (localStorage). Call it in an injection context (a field initializer). */
export function persistedSignal<T>(key: string, initial: T): WritableSignal<T> {
  const state = signal<T>(readLocal(key, initial));
  effect(() => writeLocal(key, state()));
  return state;
}
