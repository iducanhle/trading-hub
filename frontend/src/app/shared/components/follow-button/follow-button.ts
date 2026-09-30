import { Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { FollowTarget, FollowsService } from '../../../core/services/follows.service';
import { Icon } from '../../icon/icon';

/**
 * Follow / Following toggle: writes or deletes `users/{uid}/follows/{symbol}` optimistically; unfollowing offers
 * Undo. `compact` shows a star icon button (phone headers).
 */
@Component({
  selector: 'app-follow-button',
  imports: [MatButton, MatIconButton, Icon],
  template: `
    @if (compact()) {
      <button
        matIconButton
        type="button"
        [disabled]="!target()"
        [attr.aria-pressed]="followed()"
        [attr.aria-label]="followed() ? unfollowLabel() : followLabel()"
        (click)="toggle()"
      >
        <app-icon [name]="followed() ? 'star-fill' : 'star'" [class.text-primary]="followed()" />
      </button>
    } @else {
      <button
        [matButton]="followed() ? 'tonal' : 'filled'"
        type="button"
        [disabled]="!target()"
        [attr.aria-pressed]="followed()"
        (click)="toggle()"
      >
        <app-icon matButtonIcon [name]="followed() ? 'star-fill' : 'star'" [size]="18" />
        @if (followed()) {
          <ng-container i18n="The user follows this stock">Following</ng-container>
        } @else {
          <ng-container i18n="Button: start following a stock">Follow</ng-container>
        }
      </button>
    }
  `,
})
export class FollowButton {
  private readonly follows = inject(FollowsService);
  readonly target = input.required<FollowTarget | null>();
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly symbol = computed(() => this.target()?.symbol ?? '');
  protected readonly followed = computed(() => this.follows.symbols().has(this.symbol()));
  protected readonly followLabel = computed(() => $localize`Follow ${this.symbol()}:symbol:`);
  protected readonly unfollowLabel = computed(
    () => $localize`Following ${this.symbol()}:symbol:. Unfollow`,
  );

  protected toggle(): void {
    const target = this.target();
    if (!target) return;
    const action = this.followed()
      ? this.follows.unfollow(target.symbol)
      : this.follows.follow(target);
    action.catch(() => undefined); // FollowsService already told the user.
  }
}
