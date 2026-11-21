import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AirportCity, BusNetworkHttpClient, BusRoute } from './bus-network-http-client';
import { TripSelection } from './trip-selection';

/**
 * Links the trip (Ryanair airports) to Flixbus, so flights can be compared with buses. Each
 * airport stands for a Flixbus city: the city Ryanair names for it (Beauvais → Paris), or the
 * nearest one (backend `/bus/airport-cities`). Islands and Morocco have none.
 *
 * Nothing loads until a page calls `load()`. Then, for the main departure airport, its city's
 * bus routes are loaded to know which destinations can also be reached by bus.
 */
@Injectable({ providedIn: 'root' })
export class BusAvailability {
  private readonly busNetwork = inject(BusNetworkHttpClient);
  private readonly trip = inject(TripSelection);

  private readonly airportCities = signal<AirportCity[]>([]);
  private readonly loaded = signal(false);
  private readonly failed = signal(false);
  /** Bus routes per departure city id. */
  private readonly cityToRoutes = signal<Record<string, BusRoute[]>>({});

  readonly airportToCity = computed(
    () => new Map(this.airportCities().map((match) => [match.airport, match])),
  );

  private readonly cityToAirports = computed(() => {
    const byCity = new Map<string, string[]>();
    for (const { airport, city } of this.airportCities()) {
      byCity.set(city, [...(byCity.get(city) ?? []), airport]);
    }
    return byCity;
  });

  private readonly originCity = computed(
    () => this.airportToCity().get(this.trip.origin() ?? '') ?? null,
  );

  /**
   * Ryanair airports whose city the main departure airport's city reaches by bus, and whether
   * without a change. Empty until the routes load.
   */
  readonly busToAirport = computed<ReadonlyMap<string, boolean>>(() => {
    const origin = this.originCity();
    const routes = origin ? this.cityToRoutes()[origin.city] : undefined;
    const reachable = new Map<string, boolean>();
    for (const route of routes ?? []) {
      for (const airport of this.cityToAirports().get(route.destination) ?? []) {
        reachable.set(airport, (reachable.get(airport) ?? false) || route.direct);
      }
    }
    return reachable;
  });

  /** The bus side of the trip: departure cities (one per city) and the destination city. */
  readonly busTrip = computed(() => {
    const byAirport = this.airportToCity();
    const origins = [
      ...new Map(
        this.trip
          .origins()
          .map((code) => byAirport.get(code))
          .filter((match): match is AirportCity => !!match)
          .map((match) => [match.city, match]),
      ).values(),
    ];
    const destination = byAirport.get(this.trip.destination() ?? '') ?? null;
    return { origins, destination };
  });

  /**
   * Why this trip can't be compared with buses, or '' when it can. Shown on the Search page and
   * kept with the results.
   */
  readonly compareNote = computed(() => {
    if (!this.trip.isComplete()) {
      return '';
    }
    if (this.failed()) {
      return "Flixbus couldn't be checked: flights only.";
    }
    if (!this.loaded()) {
      return 'Checking Flixbus…';
    }
    const destination = this.trip.destinationAirport();
    if (!destination) {
      return 'Choose a destination airport, not a whole country, to compare with Flixbus.';
    }
    const { origins, destination: city } = this.busTrip();
    if (!city) {
      return `Flixbus doesn't go to ${destination.name}: flights only.`;
    }
    if (!origins.length) {
      const names = this.trip.originAirports().map((airport) => airport.name);
      return `Flixbus doesn't stop near ${names.join(' or ')}: flights only.`;
    }
    if (origins.every((origin) => origin.city === city.city)) {
      return `Both airports are in ${city.cityName}: no bus to compare.`;
    }
    return '';
  });

  readonly canCompare = computed(() => this.loaded() && !this.compareNote());

  constructor() {
    // Load the departure city's bus routes, to mark destinations also reached by bus.
    effect(() => {
      const city = this.originCity()?.city;
      if (city) {
        untracked(() => this.ensureRoutes(city));
      }
    });
  }

  /** Loads the airport ↔ city links once. Pages call it; nothing else triggers requests. */
  load(): void {
    if (this.loaded()) {
      return;
    }
    this.busNetwork.fetchAirportCities().subscribe({
      next: (matches) => {
        this.airportCities.set(matches);
        this.loaded.set(true);
        this.failed.set(false);
      },
      error: () => this.failed.set(true),
    });
  }

  private ensureRoutes(city: string): void {
    if (this.cityToRoutes()[city]) {
      return;
    }
    this.busNetwork.fetchRoutes(city).subscribe({
      next: (routes) => this.cityToRoutes.update((all) => ({ ...all, [city]: routes })),
      // Without them destinations just aren't marked; the search still compares.
      error: () => this.cityToRoutes.update((all) => ({ ...all, [city]: [] })),
    });
  }
}
