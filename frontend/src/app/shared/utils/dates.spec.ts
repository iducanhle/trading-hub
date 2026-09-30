import {
  addDays,
  addMonths,
  diffDays,
  eachDay,
  endOfMonth,
  formatDate,
  formatDateRange,
  isWeekend,
  monthGrid,
  relativeDay,
  startOfWeek,
  timeAgo,
  toIsoDate,
  weekdayIndex,
} from './dates';

describe('dates', () => {
  it('does calendar arithmetic without time-zone drift', () => {
    expect(addDays('2026-09-28', 3)).toBe('2026-10-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // across the EU DST change
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDays('2026-09-30', '2026-10-03')).toBe(3);
    expect(diffDays('2026-10-03', '2026-09-30')).toBe(-3);
    expect(toIsoDate(new Date(2026, 8, 5))).toBe('2026-09-05');
  });

  it('knows weekdays, weeks and months', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-04')).toBe(6); // Sunday
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28');
    expect(startOfWeek('2026-10-04')).toBe('2026-09-28');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('builds a 42-day month grid starting on Monday', () => {
    const grid = monthGrid('2026-09-15');
    expect(grid).toEqual({ from: '2026-08-31', to: '2026-10-11' });
    expect(eachDay(grid.from, grid.to)).toHaveLength(42);
  });

  it('labels relative days', () => {
    const today = '2026-09-30';
    expect(relativeDay('2026-09-30', today)).toBe('Today');
    expect(relativeDay('2026-10-01', today)).toBe('Tomorrow');
    expect(relativeDay('2026-09-29', today)).toBe('Yesterday');
    expect(relativeDay('2026-10-03', today)).toBe('In 3 days');
    expect(relativeDay('2026-10-21', today)).toBe('In 3 weeks');
    expect(relativeDay('2026-09-25', today)).toBe('5 days ago');
  });

  it('formats dates and ranges', () => {
    expect(formatDate('2026-09-25', 'day', 'en-US')).toBe('Fri, Sep 25');
    expect(formatDate('2026-09-25', 'medium', 'en-US')).toBe('Sep 25, 2026');
    expect(formatDate(null)).toBe('—');
    // ICU puts thin spaces around the range dash.
    const spaces = (text: string) => text.replace(/\s/g, ' ');
    expect(spaces(formatDateRange('2026-09-22', '2026-09-26', false, 'en-US'))).toBe('Sep 22 – 26');
    expect(spaces(formatDateRange('2026-09-28', '2026-10-04', true, 'en-US'))).toBe(
      'Sep 28 – Oct 4, 2026',
    );
  });

  it('describes the age of a timestamp', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    expect(timeAgo('2026-09-30T11:59:40Z', now)).toBe('Just now');
    expect(timeAgo('2026-09-30T11:48:00Z', now)).toBe('12m ago');
    expect(timeAgo('2026-09-30T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-09-28T12:00:00Z', now)).toBe('2d ago');
  });
});
