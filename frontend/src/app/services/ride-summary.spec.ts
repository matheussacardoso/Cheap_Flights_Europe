import { changesSummary, clockTime, durationMinutes, formatDuration } from './ride-summary';

describe('ride summary', () => {
  it("keeps the stop's own time instead of converting it", () => {
    expect(clockTime('2026-12-03T18:03:00+01:00')).toBe('18:03');
    expect(clockTime('2026-12-04T21:55:00')).toBe('21:55');
    expect(clockTime(null)).toBe('');
  });

  it('measures a flight across time zones', () => {
    // Lisbon (UTC+0 in winter) 10:00 → Madrid (UTC+1) 13:00 is 2 hours, not 3.
    expect(
      durationMinutes(
        '2026-12-04T10:00:00',
        '2026-12-04T13:00:00',
        'Europe/Lisbon',
        'Europe/Madrid',
      ),
    ).toBe(120);
    // Cologne 21:55 → Palma 00:15 the next day, same zone.
    expect(
      durationMinutes(
        '2026-12-04T21:55:00',
        '2026-12-05T00:15:00',
        'Europe/Berlin',
        'Europe/Madrid',
      ),
    ).toBe(140);
  });

  it('measures a bus ride from its offsets', () => {
    expect(durationMinutes('2026-12-03T18:03:00+01:00', '2026-12-04T13:00:00+01:00')).toBe(1137);
  });

  it('formats durations', () => {
    expect(formatDuration(140)).toBe('2h 20m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(1080)).toBe('18h');
  });

  it('names the change cities', () => {
    expect(changesSummary(0, [])).toBe('Direct');
    expect(changesSummary(1, ['Lyon'])).toBe('1 change · via Lyon');
    expect(changesSummary(2, ['Karlsruhe', 'Lyon'])).toBe('2 changes · via Karlsruhe, Lyon');
  });
});
