import {
  EventCategory,
  EventRegionFilter,
  Importance,
  MarketEvent,
} from '../../core/models/contract';
import { IconName } from '../../shared/icon/icon-paths';

export interface EventFilters {
  /** Events below this importance are hidden. */
  minImportance: Importance;
  region: EventRegionFilter;
  /** Mega-cap earnings reports among the events. */
  includeEarnings: boolean;
}

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  minImportance: 'MEDIUM',
  region: 'ALL',
  includeEarnings: true,
};

export const IMPORTANCE_OPTIONS: { value: Importance; label: string }[] = [
  { value: 'LOW', label: $localize`:Importance filter\: every event:All` },
  { value: 'MEDIUM', label: $localize`:Importance filter\: medium and high:Medium+` },
  { value: 'HIGH', label: $localize`:Importance filter\: high only:High only` },
];

export function importanceLabel(importance: Importance): string {
  switch (importance) {
    case 'HIGH':
      return $localize`:Importance of an event:High`;
    case 'MEDIUM':
      return $localize`:Importance of an event:Medium`;
    default:
      return $localize`:Importance of an event:Low`;
  }
}

export const CATEGORY_ICONS: Record<EventCategory, IconName> = {
  CENTRAL_BANK: 'account_balance',
  INFLATION: 'trending_up',
  JOBS: 'work',
  GROWTH: 'bar_chart',
  TREASURY: 'savings',
  MARKET_STRUCTURE: 'swap_vert',
  EARNINGS: 'candlestick_chart',
  POLITICS: 'how_to_vote',
};

export function categoryLabel(category: EventCategory): string {
  switch (category) {
    case 'CENTRAL_BANK':
      return $localize`:Event category:Central bank`;
    case 'INFLATION':
      return $localize`:Event category:Inflation`;
    case 'JOBS':
      return $localize`:Event category:Jobs`;
    case 'GROWTH':
      return $localize`:Event category:Growth`;
    case 'TREASURY':
      return $localize`:Event category:Treasury`;
    case 'MARKET_STRUCTURE':
      return $localize`:Event category:Market structure`;
    case 'EARNINGS':
      return $localize`:Event category:Earnings`;
    default:
      return $localize`:Event category:Politics`;
  }
}

export function countryLabel(country: MarketEvent['country']): string {
  switch (country) {
    case 'US':
      return $localize`:Country of an event:United States`;
    case 'EU':
      return $localize`:Country of an event:Euro area`;
    case 'GB':
      return $localize`:Country of an event:United Kingdom`;
    default:
      return $localize`:Country of an event:Japan`;
  }
}

export function eventFiltersAreDefault(filters: EventFilters): boolean {
  return (
    filters.minImportance === DEFAULT_EVENT_FILTERS.minImportance &&
    filters.region === DEFAULT_EVENT_FILTERS.region &&
    filters.includeEarnings === DEFAULT_EVENT_FILTERS.includeEarnings
  );
}

/** `1 event`, `5 events`. */
export function eventCount(n: number): string {
  return n === 1 ? $localize`${n}:count: event` : $localize`${n}:count: events`;
}

/** All-day events first, then by time. */
export function chronological(events: MarketEvent[]): MarketEvent[] {
  return [...events].sort((a, b) => {
    if (!a.startsAt || !b.startsAt) return a.startsAt ? 1 : b.startsAt ? -1 : 0;
    return a.startsAt.localeCompare(b.startsAt);
  });
}

/** Events that moved the S&P 500 at least this much more than an ordinary day are worth saying so. */
const NOTABLE_MOVE_RATIO = 1.2;

/** `1.6` → `1.6×` when the event historically moves the market clearly more than a normal day, else null. */
export function notableMove(ratio: number | null): string | null {
  return ratio !== null && ratio >= NOTABLE_MOVE_RATIO ? `${ratio.toFixed(1)}×` : null;
}
