import { Component, computed, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import {
  DISPLAY_CURRENCIES,
  DisplayCurrencyService,
} from '../../core/services/display-currency.service';
import { CurrencyFlag } from '../../shared/components/currency-flag/currency-flag';
import { Dialog } from '../../shared/components/dialog/dialog';
import { Icon } from '../../shared/icon/icon';
import { NUMBER_LOCALE } from '../../shared/utils/format';

const currencyNames = (() => {
  try {
    return new Intl.DisplayNames([NUMBER_LOCALE], { type: 'currency' });
  } catch {
    return null;
  }
})();

const rateFormat = new Intl.NumberFormat(NUMBER_LOCALE, { maximumSignificantDigits: 4 });

/**
 * Picks the currency the portfolio's amounts are shown in (header flag button). States the real account currency
 * and that converted amounts are only approximate (today's rate for every amount, past ones included).
 */
@Component({
  selector: 'app-display-currency-dialog',
  imports: [Dialog, CurrencyFlag, Icon],
  template: `
    @let account = service.accountCurrency();
    <app-dialog
      title="Display currency"
      i18n-title="Dialog title: currency the amounts are shown in"
    >
      <div class="flex items-center gap-3 rounded-[22px] bg-surface-container px-[18px] py-3.5">
        <app-currency-flag [currency]="account" [size]="36" />
        <div class="min-w-0 flex-1">
          <p class="app-label" i18n="Label: the real currency of the Trading 212 account">
            Account currency
          </p>
          <p class="mt-0.5 truncate text-[15px] font-semibold">
            {{ account }} · {{ name(account) }}
          </p>
        </div>
      </div>

      <p class="app-label mt-5 mb-1.5 px-1" i18n="Label above the list of currencies">
        Show amounts in
      </p>
      <ul class="m-0 list-none p-0" role="radiogroup" [attr.aria-label]="labels.list">
        @for (code of currencies(); track code) {
          @let rate = service.rate(account, code);
          @let available = code === account || rate !== null;
          @let selected = code === service.current();
          <li>
            <button
              type="button"
              role="radio"
              class="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-surface-container-high disabled:opacity-40"
              [class.bg-secondary-container]="selected"
              [class.text-on-secondary-container]="selected"
              [attr.aria-checked]="selected"
              [disabled]="!available"
              (click)="pick(code)"
            >
              <app-currency-flag [currency]="code" [size]="28" />
              <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-medium">
                  {{ code }}
                  @if (code === account) {
                    <span
                      class="app-pill ml-1 bg-surface-container-highest text-on-surface-variant"
                      i18n="Pill next to the account's own currency in the currency list"
                      >Account</span
                    >
                  }
                </span>
                <span class="block truncate app-row-meta">
                  {{ name(code) }}
                  @if (code !== account && rate !== null) {
                    · 1 {{ account }} = {{ formatRate(rate) }} {{ code }}
                  }
                </span>
              </span>
              @if (selected) {
                <app-icon name="check" [size]="20" />
              }
            </button>
          </li>
        }
      </ul>
      @if (service.ratesLoading()) {
        <p class="mt-2 px-1 app-row-meta" i18n>Loading exchange rates…</p>
      } @else if (service.ratesFailed()) {
        <p class="mt-2 px-1 text-sm text-error" i18n>
          Exchange rates aren't available right now, so amounts stay in the account currency.
        </p>
      }

      <div
        class="mt-5 flex gap-3 rounded-[22px] bg-surface-container px-[18px] py-3.5 text-[13px] leading-relaxed text-on-surface-variant"
      >
        <app-icon name="info" [size]="18" class="mt-0.5 shrink-0" />
        <p class="m-0" i18n>
          Converted amounts are only approximate. Every amount, past trades and profit included, is
          converted at today's exchange rate, so it can differ from what Trading 212 would show in
          that currency. The account itself stays in {{ account }}.
        </p>
      </div>
    </app-dialog>
  `,
})
export class DisplayCurrencyDialog {
  protected readonly service = inject(DisplayCurrencyService);
  private readonly ref = inject(MatDialogRef<DisplayCurrencyDialog>);

  /** The account currency first, then the others. */
  protected readonly currencies = computed(() => {
    const account = this.service.accountCurrency();
    const rest = DISPLAY_CURRENCIES.filter((c) => c !== account);
    return account ? [account, ...rest] : [...rest];
  });

  protected readonly labels = {
    list: $localize`Currencies`,
  };

  constructor() {
    this.service.loadRates();
  }

  protected name(code: string | null): string {
    if (!code) return '';
    return currencyNames?.of(code) ?? code;
  }

  protected formatRate(rate: number): string {
    return rateFormat.format(rate);
  }

  protected pick(code: string): void {
    this.service.set(code);
    this.ref.close();
  }
}
