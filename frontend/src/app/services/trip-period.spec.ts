import {
  addDays,
  countWeekdays,
  nights,
  periodLength,
  presetLabel,
  toIsoDate,
  weekdayDates,
} from './trip-period';

describe('trip period helpers', () => {
  it('counts nights across the end of the week, like the backend', () => {
    expect(nights('thursday', 'monday')).toBe(4);
    expect(nights('wednesday', 'monday')).toBe(5);
    expect(nights('friday', 'sunday')).toBe(2);
    expect(nights('friday', 'friday')).toBe(7);
  });

  it('counts how many departures fall in a period', () => {
    // December 2026 starts on a Tuesday: Thursdays 3, 10, 17, 24 and 31.
    expect(countWeekdays('2026-12-01', '2026-12-31', 'thursday')).toBe(5);
    expect(countWeekdays('2026-12-03', '2026-12-03', 'thursday')).toBe(1);
    expect(countWeekdays('2026-12-04', '2026-12-09', 'thursday')).toBe(0);
    expect(countWeekdays('2026-12-31', '2026-12-01', 'thursday')).toBe(0);
    expect(countWeekdays('', '2026-12-01', 'thursday')).toBe(0);
  });

  it('measures the period in days', () => {
    expect(periodLength('2026-12-01', '2026-12-31')).toBe(30);
    expect(periodLength('2026-12-01', 'nope')).toBeNaN();
  });

  it('labels presets with short day names', () => {
    expect(presetLabel({ departDay: 'thursday', returnDay: 'monday' })).toBe('Thu → Mon');
  });

  it('lists the dates of one weekday, one week apart', () => {
    expect(weekdayDates('thursday', '2026-11-13', 3)).toEqual([
      '2026-11-19',
      '2026-11-26',
      '2026-12-03',
    ]);
    // The start date counts when it is the right weekday.
    expect(weekdayDates('friday', '2026-11-13', 1)).toEqual(['2026-11-13']);
    expect(weekdayDates('friday', 'nope', 1)).toEqual([]);
  });

  it('adds days across months and years, and formats local dates', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
