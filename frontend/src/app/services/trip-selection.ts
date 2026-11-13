import { Injectable, computed, inject, signal } from '@angular/core';
import { Airport, NetworkService, Route } from './network';

export interface Country {
  code: string;
  name: string;
  airports: Airport[];
}

/**
 * A trip: an origin airport and either a destination airport or "any airport" in a destination
 * country. It is also the shape of the search parameters the trip maps to.
 */
export interface TripSearchSelection {
  origin: string | null;
  destination: string | null;
  destinationCountry: string | null;
}

/** "Name (CODE)", or "Name, City (CODE)" when the airport isn't named after its city. */
export function airportLabel(airport: Airport): string {
  return airport.city === airport.name
    ? `${airport.name} (${airport.code})`
    : `${airport.name}, ${airport.city} (${airport.code})`;
}

/**
 * Shared state for choosing a trip, airport first: the origin airport, then a destination airport
 * or "any airport in a country". Every view (the From/To boxes, the destination list, the map)
 * reads and writes this store, so they always stay in sync. Changing the origin clears the
 * destination.
 */
@Injectable({ providedIn: 'root' })
export class TripSelection {
  private network = inject(NetworkService);

  readonly airports = signal<Airport[]>([]);
  /** Routes from every airport in the origin's country (the API serves them per country). */
  readonly routes = signal<Route[]>([]);
  readonly loadingAirports = signal(false);
  readonly loadingRoutes = signal(false);
  readonly error = signal('');

  readonly origin = signal<string | null>(null);
  readonly destination = signal<string | null>(null);
  /** Set only for "any airport in this country"; never together with `destination`. */
  readonly destinationCountry = signal<string | null>(null);

  readonly airportsByCode = computed(
    () => new Map(this.airports().map((airport) => [airport.code, airport])),
  );

  readonly countries = computed<Country[]>(() => {
    const byCode = new Map<string, Country>();
    for (const airport of this.airports()) {
      const country = byCode.get(airport.countryCode) ?? {
        code: airport.countryCode,
        name: airport.countryName,
        airports: [],
      };
      country.airports.push(airport);
      byCode.set(airport.countryCode, country);
    }
    for (const country of byCode.values()) {
      country.airports.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly originAirport = computed(() => this.airportsByCode().get(this.origin() ?? '') ?? null);
  readonly originCountry = computed(() => this.originAirport()?.countryCode ?? null);
  readonly destinationAirport = computed(
    () => this.airportsByCode().get(this.destination() ?? '') ?? null,
  );

  /** Airports with a direct flight from the origin, by name (as listed). */
  readonly destinations = computed<Airport[]>(() => {
    const origin = this.origin();
    const byCode = this.airportsByCode();
    return this.routes()
      .filter((route) => route.origin === origin)
      .map((route) => byCode.get(route.destination))
      .filter((airport): airport is Airport => !!airport)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly destinationCodes = computed(
    () => new Set(this.destinations().map((airport) => airport.code)),
  );

  /** Countries with at least one direct flight from the origin, by name. */
  readonly reachableCountries = computed<Country[]>(() => {
    const byCode = new Map<string, Country>();
    for (const airport of this.destinations()) {
      const country = byCode.get(airport.countryCode) ?? {
        code: airport.countryCode,
        name: airport.countryName,
        airports: [],
      };
      country.airports.push(airport);
      byCode.set(airport.countryCode, country);
    }
    return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly searchSelection = computed<TripSearchSelection>(() => ({
    origin: this.origin(),
    destination: this.destination(),
    destinationCountry: this.destinationCountry(),
  }));

  readonly isComplete = computed(
    () => !!this.origin() && (!!this.destination() || !!this.destinationCountry()),
  );

  loadAirports(): void {
    if (this.airports().length || this.loadingAirports()) {
      return;
    }
    this.loadingAirports.set(true);
    this.error.set('');
    this.network.getAirports().subscribe({
      next: (airports) => {
        this.airports.set(airports);
        this.loadingAirports.set(false);
      },
      error: () => {
        this.error.set('Could not load airports. Check that the backend is running.');
        this.loadingAirports.set(false);
      },
    });
  }

  selectOrigin(code: string): void {
    const airport = this.airportsByCode().get(code);
    if (!airport || code === this.origin()) {
      return;
    }
    const previousCountry = this.originCountry();
    this.origin.set(code);
    this.clearDestination();
    if (airport.countryCode !== previousCountry) {
      this.routes.set([]);
      this.loadRoutes(airport.countryCode);
    }
  }

  selectDestination(code: string): void {
    this.destination.set(code);
    this.destinationCountry.set(null);
  }

  /** "Any airport in this country". */
  selectDestinationCountry(code: string): void {
    this.destination.set(null);
    this.destinationCountry.set(code);
  }

  clearOrigin(): void {
    this.origin.set(null);
    this.clearDestination();
    this.routes.set([]);
    this.loadingRoutes.set(false);
  }

  clearDestination(): void {
    this.destination.set(null);
    this.destinationCountry.set(null);
  }

  /** Can the trip be reversed? Only a single destination airport can become the origin. */
  readonly canSwap = computed(() => !!this.origin() && !!this.destination());

  /**
   * Flies the trip the other way. The return route is checked once its routes load: if it
   * doesn't exist, the destination is cleared.
   */
  swap(): void {
    const origin = this.origin();
    const destination = this.destination();
    if (!origin || !destination) {
      return;
    }
    this.selectOrigin(destination);
    this.selectDestination(origin);
    this.dropUnservedDestination();
  }

  /**
   * Fills the whole trip at once (a saved route, a shared link). Returns false, and changes
   * nothing, when the airports aren't loaded yet or are no longer in Ryanair's network. A
   * destination without a direct flight is dropped once the routes load.
   */
  applyRoute(route: TripSearchSelection): boolean {
    const byCode = this.airportsByCode();
    const known =
      !!route.origin &&
      byCode.has(route.origin) &&
      (!route.destination || byCode.has(route.destination)) &&
      (!route.destinationCountry ||
        this.countries().some((country) => country.code === route.destinationCountry));
    if (!known) {
      return false;
    }
    this.selectOrigin(route.origin!);
    if (route.destination) {
      this.selectDestination(route.destination);
    } else if (route.destinationCountry) {
      this.selectDestinationCountry(route.destinationCountry);
    } else {
      this.clearDestination();
    }
    this.dropUnservedDestination();
    return true;
  }

  retry(): void {
    const country = this.originCountry();
    if (!this.airports().length) {
      this.loadAirports();
    } else if (country) {
      this.loadRoutes(country);
    }
  }

  private loadRoutes(country: string): void {
    this.loadingRoutes.set(true);
    this.error.set('');
    this.network.getRoutes(country).subscribe({
      next: (routes) => {
        // Ignore a late response if the user already picked an origin in another country.
        if (this.originCountry() === country) {
          this.routes.set(routes);
          this.loadingRoutes.set(false);
          this.dropUnservedDestination();
        }
      },
      error: () => {
        if (this.originCountry() === country) {
          this.error.set('Could not load routes. Check that the backend is running.');
          this.loadingRoutes.set(false);
        }
      },
    });
  }

  /** Once routes are known, a destination without a direct flight from the origin is cleared. */
  private dropUnservedDestination(): void {
    if (this.loadingRoutes()) {
      return;
    }
    const destination = this.destination();
    const country = this.destinationCountry();
    const servedAirport = !destination || this.destinationCodes().has(destination);
    const servedCountry =
      !country || this.reachableCountries().some((reachable) => reachable.code === country);
    if (!servedAirport || !servedCountry) {
      this.clearDestination();
    }
  }
}
