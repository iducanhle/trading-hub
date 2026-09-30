import { EarningsEvent, FollowedEarningsResponse, SearchResult } from '../../core/models/contract';
import { addDays, startOfWeek } from '../../shared/utils/dates';

export interface FollowedGroup {
  title: string;
  events: EarningsEvent[];
}

export interface FollowedView {
  groups: FollowedGroup[];
  noDate: SearchResult[];
  empty: boolean;
}

/**
 * Splits upcoming reports into This week / Next week / Later (weeks start on Monday), keeps only stocks that are
 * still followed, and lists followed stocks the response does not know yet under "No date announced" (they are
 * fetched again in the background).
 */
export function groupFollowed(
  response: FollowedEarningsResponse,
  followed: ReadonlyMap<string, SearchResult>,
  today: string,
): FollowedView {
  const thisWeekEnd = addDays(startOfWeek(today), 6);
  const nextWeekEnd = addDays(thisWeekEnd, 7);
  const upcoming = response.upcoming.filter((e) => followed.has(e.symbol) && e.date >= today);
  const known = new Set([
    ...response.upcoming.map((e) => e.symbol),
    ...response.noUpcomingDate.map((s) => s.symbol),
  ]);
  const noDate = [
    ...response.noUpcomingDate.filter((s) => followed.has(s.symbol)),
    ...[...followed.values()].filter((s) => !known.has(s.symbol)),
  ];
  const groups: FollowedGroup[] = [
    { title: $localize`This week`, events: upcoming.filter((e) => e.date <= thisWeekEnd) },
    {
      title: $localize`Next week`,
      events: upcoming.filter((e) => e.date > thisWeekEnd && e.date <= nextWeekEnd),
    },
    { title: $localize`Later`, events: upcoming.filter((e) => e.date > nextWeekEnd) },
  ].filter((g) => g.events.length);
  return { groups, noDate, empty: !groups.length && !noDate.length };
}
