import { Component, computed, input, linkedSignal } from '@angular/core';
import { AppUser } from '../../../core/auth/auth.service';
import { userInitials } from '../../utils/user';

/** The user's photo, or their initials on the accent tint when there is none or it fails to load. Decorative. */
@Component({
  selector: 'app-user-avatar',
  template: `
    @if (user()?.photoUrl && !failed()) {
      <img
        [src]="user()!.photoUrl"
        alt=""
        [width]="size()"
        [height]="size()"
        referrerpolicy="no-referrer"
        class="size-full rounded-full"
        (error)="failed.set(true)"
      />
    } @else {
      <span
        class="flex size-full items-center justify-center rounded-full bg-primary-container font-extrabold text-on-primary-container"
        [style.font-size.px]="size() * 0.38"
        >{{ initials() }}</span
      >
    }
  `,
  host: {
    class: 'inline-block shrink-0',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    'aria-hidden': 'true',
  },
})
export class UserAvatar {
  readonly user = input.required<AppUser | null | undefined>();
  readonly size = input(40);

  /** Resets whenever the photo changes. */
  protected readonly failed = linkedSignal({
    source: () => this.user()?.photoUrl,
    computation: () => false,
  });
  protected readonly initials = computed(() => userInitials(this.user()));
}
