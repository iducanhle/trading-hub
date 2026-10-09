import { Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { COMPARE_MAX, CompareService } from '../../core/services/compare.service';
import { SearchResult } from '../../core/models/contract';
import { NotifierService } from '../../core/services/notifier.service';
import { Icon } from '../../shared/icon/icon';

/**
 * The stock page's floating button at the bottom right (just above the portfolio pill when it shows): adds the
 * stock to the compare list, or takes it out again.
 */
@Component({
  selector: 'app-compare-button',
  imports: [Icon],
  host: {
    class: 'pointer-events-none fixed right-4 z-30 lg:right-6',
    '[class.bottom-above-nav]': 'aboveNav()',
    '[class.bottom-fab]': '!aboveNav()',
  },
  template: `
    <button
      type="button"
      class="pointer-events-auto flex size-14 items-center justify-center rounded-[18px] ring-1 transition-colors duration-200 disabled:opacity-50"
      [class]="
        added()
          ? 'bg-secondary-container text-on-secondary-container ring-outline-variant'
          : 'bg-primary text-on-primary ring-transparent'
      "
      [disabled]="!target()"
      [attr.aria-pressed]="added()"
      [attr.aria-label]="added() ? removeLabel() : addLabel()"
      [attr.title]="added() ? removeLabel() : addLabel()"
      (click)="toggle()"
    >
      <app-icon [name]="added() ? 'check' : 'compare'" [size]="24" />
    </button>
  `,
})
export class CompareButton {
  private readonly compare = inject(CompareService);
  private readonly notifier = inject(NotifierService);
  private readonly router = inject(Router);

  readonly target = input.required<SearchResult | null>();
  /** Sits above the floating portfolio pill instead of at the bottom edge. */
  readonly aboveNav = input(false, { transform: booleanAttribute });

  private readonly symbol = computed(() => this.target()?.symbol ?? '');
  protected readonly added = computed(() =>
    this.compare.items().some((s) => s.symbol === this.symbol()),
  );
  protected readonly addLabel = computed(() => $localize`Add ${this.symbol()}:symbol: to compare`);
  protected readonly removeLabel = computed(
    () => $localize`${this.symbol()}:symbol: is in compare. Remove`,
  );

  /** Snackbars sit above the button, so their action is not a tap away from it. */
  private notify(message: string, action?: string) {
    const lift = this.aboveNav() ? 'app-snackbar-above-fab-nav' : 'app-snackbar-above-fab';
    return this.notifier.show(message, action, { panelClass: ['app-snackbar-offset', lift] });
  }

  protected async toggle(): Promise<void> {
    const target = this.target();
    if (!target) return;
    if (this.added()) {
      this.compare.remove(target.symbol);
      void this.notify($localize`Removed ${target.symbol}:symbol: from compare`);
      return;
    }
    if (!this.compare.add(target)) {
      void this.notify(
        $localize`You can compare up to ${COMPARE_MAX}:max: stocks. Remove one first.`,
      );
      return;
    }
    const ref = await this.notify(
      $localize`Added ${target.symbol}:symbol: to compare`,
      $localize`:Snackbar action that opens the compare page:Open`,
    );
    ref.onAction().subscribe(() => void this.router.navigateByUrl('/compare'));
  }
}
