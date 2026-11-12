import { Injectable, computed, inject, signal } from '@angular/core';
import { Airport, NetworkService, Route } from './network';

export interface Country {
  code: string;
  name: string;
  airports: Airport[];
}

/** The search parameters a completed selection maps to. */
export interface TripSearchSelection {
  origin: string | null;
  destination: string | null;
  destinationCountry: string | null;
}

/** Destination value meaning "any airport in the destination country". */
export const ANY_AIRPORT = 'ANY';

/**
 * Shared state for choosing a trip: origin country → destination country → origin airport →
 * destination airport. Every view of the picker (cards today, a map later) reads and writes
 * this store, so they always stay in sync. Choosing a step clears the steps after it.
 */
@Injectable({ providedIn: 'root' })
export class TripSelection {
  private network = inject(NetworkService);

  readonly airports = signal<Airport[]>([]);
  readonly routes = signal<Route[]>([]);
  readonly loadingAirports = signal(false);
  readonly loadingRoutes = signal(false);
  readonly error = signal('');

  readonly originCountry = signal<string | null>(null);
  readonly destinationCountry = signal<string | null>(null);
  readonly originAirport = signal<string | null>(null);
  readonly destinationAirport = signal<string | null>(null);

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

  /** Countries with a direct route from any airport in the origin country. */
  readonly reachableCountries = computed(() => {
    const byCode = this.airportsByCode();
    return new Set(
      this.routes()
        .map((route) => byCode.get(route.destination)?.countryCode)
        .filter((code): code is string => !!code),
    );
  });

  /** Origin airports with at least one direct route to the destination country. */
  readonly originAirportsServingDestination = computed(() => {
    const destination = this.destinationCountry();
    const byCode = this.airportsByCode();
    return new Set(
      this.routes()
        .filter((route) => byCode.get(route.destination)?.countryCode === destination)
        .map((route) => route.origin),
    );
  });

  /** Airports in the destination country reachable from the origin airport. */
  readonly reachableDestinationAirports = computed(() => {
    const origin = this.originAirport();
    const destination = this.destinationCountry();
    const byCode = this.airportsByCode();
    return new Set(
      this.routes()
        .filter(
          (route) =>
            route.origin === origin && byCode.get(route.destination)?.countryCode === destination,
        )
        .map((route) => route.destination),
    );
  });

  readonly searchSelection = computed<TripSearchSelection>(() => {
    const destination = this.destinationAirport();
    return {
      origin: this.originAirport(),
      destination: destination && destination !== ANY_AIRPORT ? destination : null,
      destinationCountry: destination === ANY_AIRPORT ? this.destinationCountry() : null,
    };
  });

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

  selectOriginCountry(code: string): void {
    if (code === this.originCountry()) {
      return;
    }
    this.originCountry.set(code);
    this.destinationCountry.set(null);
    this.originAirport.set(null);
    this.destinationAirport.set(null);
    this.routes.set([]);
    this.loadRoutes(code);
  }

  selectDestinationCountry(code: string): void {
    if (code === this.destinationCountry()) {
      return;
    }
    this.destinationCountry.set(code);
    this.originAirport.set(null);
    this.destinationAirport.set(null);
  }

  selectOriginAirport(code: string): void {
    if (code === this.originAirport()) {
      return;
    }
    this.originAirport.set(code);
    this.destinationAirport.set(null);
  }

  selectDestinationAirport(code: string): void {
    this.destinationAirport.set(code);
  }

  retry(): void {
    const origin = this.originCountry();
    if (!this.airports().length) {
      this.loadAirports();
    } else if (origin) {
      this.loadRoutes(origin);
    }
  }

  private loadRoutes(originCountry: string): void {
    this.loadingRoutes.set(true);
    this.error.set('');
    this.network.getRoutes(originCountry).subscribe({
      next: (routes) => {
        // Ignore a late response if the user already picked another origin country.
        if (this.originCountry() === originCountry) {
          this.routes.set(routes);
          this.loadingRoutes.set(false);
        }
      },
      error: () => {
        if (this.originCountry() === originCountry) {
          this.error.set('Could not load routes. Check that the backend is running.');
          this.loadingRoutes.set(false);
        }
      },
    });
  }
}
