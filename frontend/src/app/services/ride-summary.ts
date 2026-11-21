/**
 * Times and durations for the comparison. Flight times come without an offset, local to each
 * airport (the airport's `timeZone` says which zone); bus times carry their offset.
 */

/**
 * "14:03" from "2026-12-03T14:03:00+01:00" or "2026-12-03T14:03:00": the time where the ride
 * leaves or arrives, as on the ticket. (Formatting a Date would convert it to the browser's zone.)
 */
export function clockTime(iso: string | null | undefined): string {
  return iso?.slice(11, 16) ?? '';
}

/** Minutes between two times. Times without an offset are read in the given IANA zone. */
export function durationMinutes(
  departure: string,
  arrival: string,
  departureZone = 'UTC',
  arrivalZone = 'UTC',
): number {
  return Math.round(
    (toInstant(arrival, arrivalZone) - toInstant(departure, departureZone)) / 60000,
  );
}

/** "2h 20m", "45m", "18h". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) {
    return `${rest}m`;
  }
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "Direct", "1 change · via Lyon", "2 changes · via Karlsruhe, Lyon". */
export function changesSummary(transfers: number, via: string[]): string {
  if (!transfers) {
    return 'Direct';
  }
  const count = `${transfers} ${transfers === 1 ? 'change' : 'changes'}`;
  return via.length ? `${count} · via ${via.join(', ')}` : count;
}

/** Milliseconds since the epoch. An ISO time with an offset is exact; without, it's local to `zone`. */
function toInstant(iso: string, zone: string): number {
  if (/(Z|[+-]\d\d:\d\d)$/.test(iso)) {
    return Date.parse(iso);
  }
  const asUtc = Date.parse(`${iso}Z`);
  return asUtc - zoneOffset(asUtc, zone);
}

/** How far `zone`'s clock is ahead of UTC at that instant, in milliseconds. */
function zoneOffset(instant: number, zone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
  } catch {
    return 0; // unknown zone: read the time as UTC
  }
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return local - instant;
}
