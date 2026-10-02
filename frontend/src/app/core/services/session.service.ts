import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../api/api.service';
import { AccessService } from '../auth/access.service';
import { AuthService } from '../auth/auth.service';
import { FollowsService } from './follows.service';
import { SettingsService } from './settings.service';
import { T212Service } from './t212.service';

/** Starts the signed-in user's live data and tears everything down on sign-out. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly api = inject(ApiService);
  private readonly follows = inject(FollowsService);
  private readonly settings = inject(SettingsService);
  private readonly t212 = inject(T212Service);
  private readonly router = inject(Router);

  /** Called by the app shell, i.e. once the guards let a verified, allowed user in. */
  start(): void {
    const user = this.auth.user();
    if (!user) return;
    this.settings.start(user);
    this.follows.start(user.uid);
  }

  async signOut(): Promise<void> {
    this.follows.stop();
    this.settings.stop();
    this.access.reset();
    this.api.clearCache();
    this.t212.reset();
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
