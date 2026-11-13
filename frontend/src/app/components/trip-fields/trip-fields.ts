import { Component, computed, inject, input } from '@angular/core';
import { TripSelection } from '../../services/trip-selection';
import {
  AirportSearchComponent,
  SearchOption,
  airportOption,
  countryOption,
} from '../airport-search/airport-search';

/** The From, swap and To boxes, bound to the shared `TripSelection` store. */
@Component({
  selector: 'app-trip-fields',
  standalone: true,
  imports: [AirportSearchComponent],
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
