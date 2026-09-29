import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/icon/icon';
import { AuthCard } from '../auth-card';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, MatButton, MatFormField, MatLabel, MatInput, MatError, MatProgressBar, Icon, AuthCard],
  template: `
    <app-auth-card title="Reset password" subtitle="We'll email you a link to choose a new password.">
      @if (sent()) {
        <div role="status" class="flex flex-col items-center gap-3 rounded-2xl bg-surface-container-low p-6 text-center">
          <app-icon name="mark_email_read" class="text-primary" [size]="32" />
          <p class="text-sm">
            If an account exists for <strong>{{ form.controls.email.value }}</strong>, a reset link is on its way.
            Check your inbox and spam folder.
          </p>
        </div>
      } @else {
        @if (busy()) {
          <mat-progress-bar mode="indeterminate" class="mb-4 rounded-full" aria-label="Sending" />
        }
        @if (error()) {
          <p role="alert" class="mb-4 rounded-xl bg-error-container px-3 py-2 text-sm text-on-error-container">
            {{ error() }}
          </p>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-1" novalidate>
          <mat-form-field appearance="outline">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" inputmode="email" />
            <mat-error>Enter a valid email address.</mat-error>
          </mat-form-field>
          <button matButton="filled" type="submit" class="h-12!" [disabled]="busy()">Send reset link</button>
        </form>
      }
      <p class="mt-8 text-center text-sm">
        <a routerLink="/login" class="font-medium text-primary">Back to sign in</a>
      </p>
    </app-auth-card>
  `,
})
export class ResetPassword {
  private readonly auth = inject(AuthService);

  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.sendPasswordReset(this.form.controls.email.value);
      this.sent.set(true);
    } catch (error) {
      const code = (error as { code?: string }).code;
      // Never reveal whether an account exists.
      if (code === 'auth/user-not-found') this.sent.set(true);
      else this.error.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
