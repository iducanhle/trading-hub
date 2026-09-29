import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { authErrorMessage } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthCard } from '../auth-card';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { password, confirm } = group.value as { password: string; confirm: string };
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, MatButton, MatFormField, MatLabel, MatInput, MatError, MatHint, MatProgressBar, AuthCard],
  template: `
    <app-auth-card title="Create account" subtitle="We'll email you a link to verify your address.">
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="mb-4 rounded-full" aria-label="Creating account" />
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
        <mat-form-field appearance="outline">
          <mat-label>Password</mat-label>
          <input matInput type="password" formControlName="password" autocomplete="new-password" />
          <mat-hint>At least 8 characters</mat-hint>
          <mat-error>Use at least 8 characters.</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Confirm password</mat-label>
          <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
          <mat-error>Confirm your password.</mat-error>
        </mat-form-field>
        @if (form.hasError('mismatch') && form.controls.confirm.touched) {
          <p role="alert" class="-mt-3 mb-3 px-4 text-xs text-error">The passwords don't match.</p>
        }
        <button matButton="filled" type="submit" class="mt-2 h-12!" [disabled]="busy()">Create account</button>
      </form>
      <p class="mt-8 text-center text-sm text-on-surface-variant">
        Already have an account?
        <a routerLink="/login" class="font-medium text-primary">Sign in</a>
      </p>
    </app-auth-card>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.register(email, password);
      await this.router.navigateByUrl('/verify-email');
    } catch (error) {
      this.error.set(authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
