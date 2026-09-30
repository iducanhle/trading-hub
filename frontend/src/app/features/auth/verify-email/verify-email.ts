import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { SessionService } from '../../../core/services/session.service';
import { Icon } from '../../../shared/icon/icon';
import { AuthCard } from '../auth-card';

const RESEND_COOLDOWN_S = 60;

@Component({
  selector: 'app-verify-email',
  imports: [MatButton, Icon, AuthCard],
  template: `
    <app-auth-card title="Verify your email">
      <div
        class="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-surface-container-low p-6 text-center"
      >
        <app-icon name="mail" class="text-primary" [size]="32" />
        <p class="text-sm">
          We sent a verification link to <strong class="break-all">{{ email() }}</strong
          >. Open it, then come back here.
        </p>
      </div>
      @if (message()) {
        <p
          role="status"
          class="mb-4 rounded-xl bg-secondary-container px-3 py-2 text-sm text-on-secondary-container"
        >
          {{ message() }}
        </p>
      }
      <div class="flex flex-col gap-3">
        <button
          matButton="filled"
          type="button"
          class="h-12!"
          [disabled]="busy()"
          (click)="verified()"
        >
          I've verified
        </button>
        <button
          matButton="outlined"
          type="button"
          class="h-12!"
          [disabled]="busy() || cooldown() > 0"
          (click)="resend()"
        >
          {{ cooldown() > 0 ? 'Resend in ' + cooldown() + ' s' : 'Resend email' }}
        </button>
        <button matButton type="button" class="h-12!" (click)="signOut()">
          Use another account
        </button>
      </div>
    </app-auth-card>
  `,
})
export class VerifyEmail {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private timer?: ReturnType<typeof setInterval>;

  protected readonly email = () => this.auth.user()?.email ?? '';
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  /** Just registered: the first email went out moments ago. */
  protected readonly cooldown = signal(0);

  constructor() {
    this.startCooldown();
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected async verified(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      const user = await this.auth.reload();
      if (user?.emailVerified) await this.router.navigateByUrl('/followed');
      else
        this.message.set(
          'Not verified yet. Open the link in the email, then tap "I\'ve verified" again.',
        );
    } catch (error) {
      this.message.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.auth.sendVerificationEmail();
      this.message.set('Sent. Check your inbox and spam folder.');
      this.startCooldown();
    } catch (error) {
      this.message.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected signOut(): void {
    void this.session.signOut();
  }

  private startCooldown(): void {
    clearInterval(this.timer);
    this.cooldown.set(RESEND_COOLDOWN_S);
    this.timer = setInterval(() => {
      this.cooldown.update((s) => Math.max(0, s - 1));
      if (this.cooldown() === 0) clearInterval(this.timer);
    }, 1000);
  }
}
