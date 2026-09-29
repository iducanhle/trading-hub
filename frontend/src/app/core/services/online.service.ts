import { Injectable, signal } from '@angular/core';

/** `navigator.onLine`, as a signal. */
@Injectable({ providedIn: 'root' })
export class OnlineService {
  readonly online = signal(navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }
}
