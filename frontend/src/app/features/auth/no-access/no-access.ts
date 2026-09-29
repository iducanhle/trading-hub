import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { Icon } from '../../../shared/icon/icon';
import { AuthCard } from '../auth-card';

@Component({
  selector: 'app-no-access',
  imports: [MatButton, Icon, AuthCard],
  template: `
    <app-auth-card title="This app is private">
      <div class="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-surface-container-low p-6 text-center">
        <app-icon name="lock" class="text-on-surface-variant" [size]="32" />
        <p class="text-sm">
          Access not granted for <strong class="break-all">{{ email() }}</strong>. Only invited accounts can use
          Earnings Tracker.
        </p>
      </div>
      <button matButton="filled" type="button" class="h-12! w-full" (click)="signOut()">
        <app-icon matButtonIcon name="logout" [size]="18" />
        Sign out
      </button>
    </app-auth-card>
  `,
})
export class NoAccess {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  protected readonly email = () => this.auth.user()?.email ?? 'this account';

  protected signOut(): void {
    void this.session.signOut();
  }
}
