import { Injectable, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** Back navigation that never leaves the app: history back when there is in-app history, else a fallback route. */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private navigations = 0;

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.navigations++);
  }

  back(fallback = '/followed'): void {
    if (this.navigations > 1) this.location.back();
    else void this.router.navigateByUrl(fallback);
  }
}
