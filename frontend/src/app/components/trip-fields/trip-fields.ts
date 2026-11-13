import { Component, computed, inject, input } from '@angular/core';
import {
  AlternativeOrigin,
  MAX_ORIGINS,
  TripSelection,
  distanceKm,
} from '../../services/trip-selection';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';
import {
  AirportSearchComponent,
  SearchOption,
  airportOption,
  countryOption,
} from '../airport-search/airport-search';

/** Suggested extra departures shown as one-click buttons. */
const SUGGESTIONS = 3;

/**
 * The From, swap and To boxes, bound to the shared `TripSelection` store. Once From and To are
 * chosen, "Also fly from" adds up to two more departure airports (e.g. Weeze as well as Cologne).
 */
@Component({
  selector: 'app-trip-fields',
  standalone: true,
  imports: [AirportSearchComponent, LoadingIndicatorComponent],
  templateUrl: './trip-fields.html',
  styleUrl: './trip-fields.css',
  host: { '[class.is-row]': "layout() === 'row'" },
})
export class TripFieldsComponent {
  readonly trip = inject(TripSelection);

  /** `stack` for the sidebar, `row` for the search form. */
  layout = input<'stack' | 'row'>('stack');

  readonly fromOptions = computed(() =>
    [...this.trip.airports()]
      .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
      .map(airportOption),
  );

  /** Direct destinations, plus "any airport" in each country that has some. */
  readonly toOptions = computed(() => [
    ...this.trip.reachableCountries().map(countryOption),
    ...this.trip.destinations().map(airportOption),
  ]);

  readonly fromValue = computed(() => {
    const airport = this.trip.originAirport();
    return airport ? airportOption(airport) : null;
  });

  readonly toValue = computed(() => {
    const airport = this.trip.destinationAirport();
    if (airport) {
      return airportOption(airport);
    }
    const country = this.trip.countries().find((c) => c.code === this.trip.destinationCountry());
    return country ? countryOption(country) : null;
  });

  readonly toHint = computed(() => {
    if (!this.trip.origin()) {
      return 'Choose where you fly from first.';
    }
    if (this.trip.loadingRoutes()) {
      return 'Loading direct flights…';
    }
    const count = this.trip.destinations().length;
    return `${count} direct ${count === 1 ? 'destination' : 'destinations'}`;
  });

  readonly maxOrigins = MAX_ORIGINS;

  /** The extra departure airports already chosen, with their distance from the first. */
  readonly extraOrigins = computed(() => {
    const first = this.trip.originAirport();
    return this.trip
      .originAirports()
      .slice(1)
      .map((airport) => ({
        airport,
        km: first ? Math.round(distanceKm(first, airport)) : 0,
      }));
  });

  /** The closest airports that fly to the destination, as one-click suggestions. */
  readonly suggestions = computed(() =>
    this.trip
      .nearbyOrigins()
      .slice(0, SUGGESTIONS)
      .map(({ airport, km }) => ({ airport, km: Math.round(km) })),
  );

  /** Every airport that flies to the destination, closest first, for the "Add" box. */
  readonly alternativeOptions = computed(() =>
    this.trip.alternativeOrigins().map(({ airport, km }: AlternativeOrigin) => ({
      ...airportOption(airport),
      subtitle: `${Math.round(km)} km away · ${airport.countryName} · ${airport.code}`,
    })),
  );

  readonly destinationName = computed(() => {
    const airport = this.trip.destinationAirport();
    if (airport) {
      return airport.name;
    }
    const country = this.trip.countries().find((c) => c.code === this.trip.destinationCountry());
    return country?.name ?? 'the destination';
  });

  addOrigin(code: string): void {
    this.trip.addOrigin(code);
  }

  chooseOrigin(option: SearchOption): void {
    this.trip.selectOrigin(option.code);
  }

  chooseDestination(option: SearchOption): void {
    if (option.kind === 'country') {
      this.trip.selectDestinationCountry(option.code);
    } else {
      this.trip.selectDestination(option.code);
    }
  }
}
