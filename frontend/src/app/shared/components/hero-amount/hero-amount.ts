import { Component, booleanAttribute, computed, input } from '@angular/core';
import { splitMoney, toneClass } from '../../utils/format';

/**
 * The large figure at the top of a page (account value, price, total profit/loss): a light 48–50 px number with
 * the currency symbol set small and bold beside it. `signed` adds + or − and colours it as a gain or a loss.
 */
@Component({
  selector: 'app-hero-amount',
  template: `
    @if (parts().symbolFirst) {
      <span class="text-[22px] font-bold">{{ parts().symbol }}</span>
    }
    <span
      class="font-light tracking-[-.02em]"
      [class]="size() === 'md' ? 'text-[42px]' : 'text-5xl'"
      >{{ parts().amount }}</span
    >
    @if (!parts().symbolFirst && parts().symbol) {
      <span class="text-[22px] font-bold">{{ parts().symbol }}</span>
    }
  `,
  host: {
    class: 'flex flex-wrap items-baseline gap-x-1.5 leading-[1.05] tabular-nums',
    '[class]': 'tone()',
  },
})
export class HeroAmount {
  readonly value = input<number | null | undefined>(null);
  readonly currency = input<string | null | undefined>(null);
  readonly signed = input(false, { transform: booleanAttribute });
  readonly size = input<'lg' | 'md'>('lg');

  protected readonly parts = computed(() =>
    splitMoney(this.value(), this.currency(), { signed: this.signed() }),
  );
  protected readonly tone = computed(() => (this.signed() ? toneClass(this.value()) : ''));
}
