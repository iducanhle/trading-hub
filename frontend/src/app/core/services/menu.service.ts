import { Injectable, signal } from '@angular/core';

/** State of the burger menu drawer shown below the `lg` breakpoint (the page headers open it, the shell renders it). */
@Injectable({ providedIn: 'root' })
export class MenuService {
  readonly open = signal(false);

  show(): void {
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
  }
}
