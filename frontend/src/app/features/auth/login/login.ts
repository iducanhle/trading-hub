import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { safeReturnUrl } from '../../../core/auth/auth.guards';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/icon/icon';
import { AuthCard } from '../auth-card';
import { GoogleLogo } from '../google-logo';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButton,
    MatIconButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatSuffix,
    MatProgressBar,
    Icon,
    AuthCard,
    GoogleLogo,
  ],
  template: `
    <app-auth-card
      title="Earnings Tracker"
      subtitle="Sign in to see your stocks and earnings dates"
    >
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="mb-4 rounded-full" aria-label="Signing in" />
      }
      @if (mockMode) {
        <p
          class="mb-4 rounded-xl bg-secondary-container px-3 py-2 text-sm text-on-secondary-container"
        >
          Mock mode: any button signs you in as mock&#64;example.com.
        </p>
      }
      @if (error()) {
        <p
          role="alert"
          class="mb-4 rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container"
        >
          {{ error() }}
        </p>
      }

      <button
        matButton="outlined"
        type="button"
        class="h-12! w-full"
        [disabled]="busy()"
        (click)="google()"
      >
        <app-google-logo matButtonIcon />
        Continue with Google
      </button>

      <div class="my-6 flex items-center gap-3 text-xs text-on-surface-variant" aria-hidden="true">
        <span class="h-px flex-1 bg-outline-variant"></span>or<span
          class="h-px flex-1 bg-outline-variant"
        ></span>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-1" novalidate>
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input
            matInput
            type="email"
            formControlName="email"
            autocomplete="email"
            inputmode="email"
          />
          @if (form.controls.email.hasError('email')) {
            <mat-error>Enter a valid email address.</mat-error>
          } @else {
            <mat-error>Email is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input
            matInput
            [type]="showPassword() ? 'text' : 'password'"
            formControlName="password"
            autocomplete="current-password"
          />
          <button
            matIconButton
            matSuffix
            type="button"
            [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            (click)="showPassword.set(!showPassword())"
          >
            <app-icon [name]="showPassword() ? 'visibility_off' : 'visibility'" />
          </button>
          <mat-error>Password is required.</mat-error>
        </mat-form-field>
        <a
          routerLink="/reset-password"
          class="-mt-2 mb-4 self-end py-2 text-sm font-medium text-primary"
        >
          Forgot password?
        </a>
        <button matButton="filled" type="submit" class="h-12!" [disabled]="busy()">Sign in</button>
      </form>

      <p class="mt-8 text-center text-sm text-on-surface-variant">
        No account yet?
        <a routerLink="/register" class="font-medium text-primary">Create one</a>
      </p>
    </app-auth-card>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly mockMode = environment.useMocks;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    // Back from Google's redirect sign-in: finish it, then continue into the app.
    if (this.auth.redirectPending()) void this.run(() => this.auth.completeRedirectSignIn());
  }

  protected google(): void {
    void this.run(async () => {
      const result = await this.auth.signInWithGoogle();
      if (result === 'redirecting') return false;
      return true;
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    void this.run(() => this.auth.signInWithEmail(email, password));
  }

  /** Runs a sign-in step with progress and error handling; navigates on success unless the step returns false. */
  private async run(step: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      if ((await step()) === false) return;
      const user = this.auth.user();
      if (!user) return;
      const target = user.emailVerified
        ? safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'))
        : '/verify-email';
      await this.router.navigateByUrl(target);
    } catch (error) {
      this.error.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
