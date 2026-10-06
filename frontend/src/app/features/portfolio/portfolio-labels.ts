import { T212Side, T212TradeKind, T212TransactionType } from '../../core/models/contract';
import { formatDate, formatDateRange } from '../../shared/utils/dates';
import { PeriodPreset, PortfolioPeriod, PortfolioTab, StockSort } from './portfolio-model';

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  '1D': $localize`:Period of one day:1D`,
  '1W': $localize`:Period of one week:1W`,
  '1M': $localize`:Period of one month:1M`,
  '3M': $localize`:Period of three months:3M`,
  '6M': $localize`:Period of six months:6M`,
  YTD: $localize`:Period since 1 January:YTD`,
  '1Y': $localize`:Period of one year:1Y`,
  ALL: $localize`:Period without limits:All`,
  CUSTOM: $localize`:Period chosen by the user:Custom`,
};

export const TAB_LABELS: Record<PortfolioTab, string> = {
  overview: $localize`:Portfolio sub-tab:Overview`,
  stocks: $localize`:Portfolio sub-tab:Stocks`,
  trades: $localize`:Portfolio sub-tab:Trades`,
  cash: $localize`:Portfolio sub-tab:Dividends`,
};

export const SORT_LABELS: Record<StockSort, string> = {
  pnl: $localize`:Sort by:Profit/loss`,
  pnlPct: $localize`:Sort by:Profit/loss %`,
  value: $localize`:Sort by:Value`,
  name: $localize`:Sort by:Name`,
};

export const SIDE_LABELS: Record<T212Side, string> = {
  BUY: $localize`:Trade direction|Kind of trade:Buy`,
  SELL: $localize`:Trade direction|Kind of trade:Sell`,
};

export const KIND_LABELS: Record<T212TradeKind, string> = {
  TRADE: $localize`:Kind of fill:Trade`,
  STOCK_SPLIT: $localize`:Kind of fill:Stock split`,
  CORPORATE_ACTION: $localize`:Kind of fill:Corporate action`,
};

export const TRANSACTION_LABELS: Record<T212TransactionType, string> = {
  DEPOSIT: $localize`:Cash transaction:Deposit`,
  WITHDRAW: $localize`:Cash transaction:Withdrawal`,
  FEE: $localize`:Cash transaction:Fee`,
  TRANSFER: $localize`:Cash transaction:Transfer`,
  INTEREST_ON_FREE_CASH: $localize`:Cash transaction:Interest on cash`,
  LENDING_INTEREST: $localize`:Cash transaction:Share lending interest`,
};

export function transactionLabel(type: string): string {
  return TRANSACTION_LABELS[type as T212TransactionType] ?? type;
}

/** Key of the custom-period chip among a tab's filter chips (tickers never start with "@"). */
export const PERIOD_CHIP = '@period';

/** The chip of a custom period (`7 Sep – 6 Oct 2026`, `From 7 Sep 2026`); null for a preset. */
export function customPeriodLabel(period: PortfolioPeriod): string | null {
  const { preset, from, to } = period;
  if (preset !== 'CUSTOM') return null;
  if (from && to) return formatDateRange(from, to, true);
  if (from) return $localize`:Custom period with only a start day:From ${formatDate(from)}:date:`;
  if (to) return $localize`:Custom period with only an end day:Until ${formatDate(to)}:date:`;
  return null;
}
