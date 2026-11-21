import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { BusRideResponse, BusTripResponse } from '../../services/bus-http-client';
import { FlightResponse, TripResponse } from '../../services/flight-http-client';
import {
  changesSummary,
  clockTime,
  durationMinutes,
  formatDuration,
} from '../../services/ride-summary';
import { SearchResults } from '../../services/search-results';
import { TripSelection } from '../../services/trip-selection';
import { LegView, RoundTripCell, SideView } from '../round-trip-cell/round-trip-cell';

interface WeekRow {
  key: string;
  /** Holds the cheapest trip of the search. */
  isCheapest: boolean;
  /** Outbound and return dates (YYYY-MM-DD). */
  outDate: string;
  backDate: string;
  destinationName: string;
  /** "(MAD)" after the name. */
  destinationCode: string;
  flight: SideView | null;
  bus: SideView | null;
  /** Which is cheaper, and by how much; also how much faster the plane is. */
  verdict: Verdict;
}

interface Verdict {
  winner: 'flight' | 'bus' | null;
  /** "Plane cheaper by", "Only by bus", "Same price". */
  text: string;
  /** The price difference, with `text` ending in "by"; null otherwise. */
  amount: number | null;
  currency: string;
  /** "The plane is 15h 40m faster on the way out." */
  detail: string;
}

/**
 * Round trips for the chosen weekdays, week by week: the cheapest Ryanair trip next to the
 * cheapest Flixbus trip between the same cities, so the user sees which is better.
 */
@Component({
  selector: 'app-trip-results-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButton,
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatIcon,
    MatRow,
    MatRowDef,
    MatTable,
    RoundTripCell,
    RouterLink,
  ],
  templateUrl: './trip-results-page.html',
  styleUrl: './trip-results-page.css',
})
export class TripResultsPage {
  private readonly trip = inject(TripSelection);
  private readonly results = inject(SearchResults);

  /** Buses were searched and found: the table compares. */
  protected readonly compared = computed(() => this.results.busTrips().length > 0);
  /** The table's columns: the bus and the verdict only when buses were compared. */
  protected readonly columns = computed(() =>
    this.compared() ? ['dates', 'to', 'flight', 'bus', 'better'] : ['dates', 'to', 'flight'],
  );
  protected readonly trackRow = (_: number, row: WeekRow) => row.key;
  /** Why there's no bus column, e.g. "Flixbus doesn't go to Palma de Mallorca: flights only." */
  protected readonly busNote = this.results.busNote;

  protected readonly rows = computed<WeekRow[]>(() => {
    const byCode = this.trip.airportsByCode();
    const nameOf = (code: string) => byCode.get(code)?.name ?? code;
    const zoneOf = (code: string) => byCode.get(code)?.timeZone ?? 'UTC';
    const flightLeg = (flight: FlightResponse, place: string): LegView => {
      const minutes = flight.arrivalTime
        ? durationMinutes(
            flight.departureTime,
            flight.arrivalTime,
            zoneOf(flight.origin),
            zoneOf(flight.destination),
          )
        : 0;
      return {
        times: times(flight.departureTime, flight.arrivalTime),
        duration: minutes ? formatDuration(minutes) : '',
        minutes,
        place,
        detail: flight.flightNumber,
        price: flight.price,
      };
    };
    const busLeg = (ride: BusRideResponse, place: string): LegView => {
      const minutes = durationMinutes(ride.departureTime, ride.arrivalTime);
      return {
        times: times(ride.departureTime, ride.arrivalTime),
        duration: formatDuration(minutes),
        minutes,
        place,
        detail: changesSummary(ride.transfers, ride.via),
        price: ride.price,
      };
    };

    const flightSide = (trip: TripResponse): SideView => ({
      total: trip.totalPrice,
      currency: trip.outbound.currency,
      outbound: flightLeg(trip.outbound, `from ${nameOf(trip.outbound.origin)}`),
      inbound: flightLeg(trip.inbound, `to ${nameOf(trip.inbound.destination)}`),
      isCheapest: false,
    });
    // Bus trips run between the airports' cities: named after the airports they stand for.
    const destinationName = this.trip.destinationAirport()?.name ?? '';
    const busSide = (trip: BusTripResponse): SideView => ({
      total: trip.totalPrice,
      currency: trip.outbound.currency,
      outbound: busLeg(trip.outbound, 'by bus'),
      inbound: busLeg(trip.inbound, 'by bus'),
      isCheapest: false,
    });

    const rows = new Map<string, WeekRow>();
    const row = (outDate: string, backDate: string, destination: string, name: string) => {
      const key = `${outDate}-${destination}`;
      const existing = rows.get(key);
      if (existing) {
        return existing;
      }
      const created: WeekRow = {
        key,
        isCheapest: false,
        outDate,
        backDate,
        destinationName: name,
        destinationCode: destination ? `(${destination})` : '',
        flight: null,
        bus: null,
        verdict: { winner: null, text: '', amount: null, currency: '', detail: '' },
      };
      rows.set(key, created);
      return created;
    };
    for (const trip of this.results.trips()) {
      const destination = trip.outbound.destination;
      row(
        day(trip.outbound.departureTime),
        day(trip.inbound.departureTime),
        destination,
        nameOf(destination),
      ).flight = flightSide(trip);
    }
    // Buses are only compared for one destination airport: a week matches by its outbound day.
    const destination = this.trip.destination() ?? '';
    for (const trip of this.results.busTrips()) {
      row(
        day(trip.outbound.departureTime),
        day(trip.inbound.departureTime),
        destination,
        destinationName,
      ).bus = busSide(trip);
    }

    const all = [...rows.values()];
    const sides = all.flatMap((r) => [r.flight, r.bus]).filter((s): s is SideView => !!s);
    const cheapest = Math.min(...sides.map((side) => side.total));
    for (const side of sides) {
      side.isCheapest = side.total === cheapest;
    }
    for (const week of all) {
      week.verdict = verdict(week.flight, week.bus);
      week.isCheapest = !!(week.flight?.isCheapest || week.bus?.isCheapest);
    }
    // Cheapest first, by each week's best option (plane or bus); then by date.
    const best = (week: WeekRow) =>
      Math.min(week.flight?.total ?? Infinity, week.bus?.total ?? Infinity);
    return all.sort((a, b) => best(a) - best(b) || a.outDate.localeCompare(b.outDate));
  });

  /** "Ryanair is cheaper in 5 weeks, Flixbus in 3." */
  protected readonly summary = computed(() => {
    if (!this.compared()) {
      return '';
    }
    const wins = (winner: 'flight' | 'bus') =>
      this.rows().filter((row) => row.flight && row.bus && row.verdict.winner === winner).length;
    const weeks = (count: number) => `${count} ${count === 1 ? 'week' : 'weeks'}`;
    return `Ryanair is cheaper in ${weeks(wins('flight'))}, Flixbus in ${weeks(wins('bus'))}.`;
  });
}

/** "2026-12-03" from a flight's or bus ride's local time. */
function day(iso: string): string {
  return iso.slice(0, 10);
}

function times(departure: string, arrival: string | null | undefined): string {
  return arrival ? `${clockTime(departure)} → ${clockTime(arrival)}` : clockTime(departure);
}

function verdict(flight: SideView | null, bus: SideView | null): Verdict {
  if (!flight || !bus) {
    const only = flight ?? bus;
    return {
      winner: flight ? 'flight' : bus ? 'bus' : null,
      text: flight ? 'Only by plane' : 'Only by bus',
      amount: null,
      currency: only?.currency ?? '',
      detail: '',
    };
  }
  const difference = Math.abs(flight.total - bus.total);
  const faster = bus.outbound.minutes - flight.outbound.minutes;
  const detail =
    flight.outbound.minutes && faster > 0
      ? `The plane is ${formatDuration(faster)} faster on the way out.`
      : '';
  if (difference < 0.005) {
    return { winner: null, text: 'Same price', amount: null, currency: flight.currency, detail };
  }
  const winner = flight.total < bus.total ? 'flight' : 'bus';
  return {
    winner,
    text: `${winner === 'flight' ? 'Plane' : 'Bus'} cheaper by`,
    amount: difference,
    currency: flight.currency,
    detail,
  };
}
