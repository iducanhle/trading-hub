import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { displayConversion } from '../../shared/utils/format';
import { ApiService } from '../api/api.service';
import { readLocal, writeLocal } from './local-store';
import { T212Service } from './t212.service';

const STORAGE_KEY = 'displayCurrency';

/** The currencies the backend has rates for (`GET /api/fx/latest`), in the order the picker lists them. */
export const DISPLAY_CURRENCIES = [
  'CZK',
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'PLN',
  'SEK',
  'NOK',
  'DKK',
] as const;

/**
 * The currency the portfolio's amounts are shown in. Everything is computed in the Trading 212 account currency;
 * only the printed text is converted, with today's rate (`displayConversion`, read by the formatters). The choice is
 * per device. Without a rate the amounts stay in the account currency.
 */
@Injectable({ providedIn: 'root' })
export class DisplayCurrencyService {
  private readonly api = inject(ApiService);
  private readonly t212 = inject(T212Service);

  /** The picked currency; null = the account currency. */
  private readonly picked = signal<string | null>(readLocal<string | null>(STORAGE_KEY, null));
  /** Rates are loaded once something needs them: a picked currency or the open picker. */
  private readonly ratesWanted = signal(this.picked() !== null);

  readonly accountCurrency = computed(() => this.t212.status()?.accountCurrency ?? null);

  private readonly rates = rxResource({
    params: () => (this.ratesWanted() ? true : undefined),
    stream: () => this.api.fxLatest(),
  });
  readonly ratesLoading = computed(() => this.rates.isLoading());
  readonly ratesFailed = computed(() => this.rates.error() != null);

  /** The currency amounts are shown in now: the picked one when it can be converted, else the account's. */
  readonly current = computed(() => {
    const account = this.accountCurrency();
    const picked = this.picked();
    return picked && this.rate(account, picked) !== null ? picked : account;
  });
  readonly converted = computed(() => {
    const account = this.accountCurrency();
    return account !== null && this.current() !== account;
  });

  constructor() {
    effect(() => {
      const from = this.accountCurrency();
      const to = this.current();
      const rate = this.rate(from, to);
      displayConversion.set(from && to && from !== to && rate !== null ? { from, to, rate } : null);
    });
  }

  /** Units of `to` per unit of `from` today; null without a rate. */
  rate(from: string | null, to: string | null): number | null {
    if (!from || !to) return null;
    if (from === to) return 1;
    const usd = this.rates.hasValue() ? this.rates.value().usdPerUnit : null;
    const fromUsd = usd?.[from];
    const toUsd = usd?.[to];
    return fromUsd && toUsd ? fromUsd / toUsd : null;
  }

  loadRates(): void {
    this.ratesWanted.set(true);
    if (this.rates.error()) this.rates.reload();
  }

  /** Shows amounts in `currency`; the account currency (or null) switches conversion off. */
  set(currency: string | null): void {
    const value = currency === this.accountCurrency() ? null : currency;
    this.picked.set(value);
    writeLocal(STORAGE_KEY, value);
    if (value) this.loadRates();
  }
}
