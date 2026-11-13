import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Airport, NetworkService, Route } from './network';

export interface Country {
  code: string;
  name: string;
  airports: Airport[];
}

/**
 * A trip: one to three departure airports and either a destination airport or "any airport" in a
 * destination country. It is also the shape of the search parameters the trip maps to.
 */
export interface TripSearchSelection {
  /** The first is the main departure airport; the others are alternatives near it. */
  origins: string[];
  destination: string | null;
  destinationCountry: string | null;
}

/** Another airport that flies to the destination, offered as an extra departure. */
export interface AlternativeOrigin {
  airport: Airport;
  /** Straight-line distance from the first departure airport. */
  km: number;
}

/** At most this many departure airports (the API's limit too). */
export const MAX_ORIGINS = 3;
/** Airports suggested as extra departures are at most this far from the first one. */
export const NEARBY_KM = 150;

/** "Name (CODE)", or "Name, City (CODE)" when the airport isn't named after its city. */
export function airportLabel(airport: Airport): string {
  return airport.city === airport.name
    ? `${airport.name} (${airport.code})`
    : `${airport.name}, ${airport.city} (${airport.code})`;
}

/** Great-circle distance in km. */
export function distanceKm(a: Airport, b: Airport): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Shared state for choosing a trip, airport first: a departure airport, then a destination
 * airport or "any airport in a country", then optionally up to two more departure airports near
 * the first (e.g. Weeze as well as Cologne). Every view (the From/To boxes, the destination list,
 * the map) reads and writes this store, so they always stay in sync.
 *
 * Rules: changing the first departure clears everything after it. Extra departures only exist
 * with a destination, and must fly there directly; changing the destination drops those that
 * don't.
 */
@Injectable({ providedIn: 'root' })
export class TripSelection {
  private network = inject(NetworkService);

  readonly airports = signal<Airport[]>([]);
  /** Routes from every airport of each loaded country (the API serves them per country). */
  readonly routesByCountry = signal<Record<string, Route[]>>({});
  private readonly loadingCountries = signal<ReadonlySet<string>>(new Set());
  readonly loadingAirports = signal(false);
  readonly error = signal('');

  readonly origins = signal<string[]>([]);
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

  /** The first (main) departure airport. */
  readonly origin = computed(() => this.origins()[0] ?? null);
  readonly originAirport = computed(() => this.airportsByCode().get(this.origin() ?? '') ?? null);
  readonly originCountry = computed(() => this.originAirport()?.countryCode ?? null);
  readonly originAirports = computed(() =>
    this.origins()
      .map((code) => this.airportsByCode().get(code))
      .filter((airport): airport is Airport => !!airport),
  );
  readonly destinationAirport = computed(
    () => this.airportsByCode().get(this.destination() ?? '') ?? null,
  );

  /** Routes from the first departure airport's country. */
  readonly routes = computed(() => this.routesByCountry()[this.originCountry() ?? ''] ?? []);
  readonly loadingRoutes = computed(() => this.loadingCountries().has(this.originCountry() ?? ''));

  /** Airports with a direct flight from the first departure airport, by name. */
  readonly destinations = computed<Airport[]>(() => this.destinationsFrom(this.origin()));

  readonly destinationCodes = computed(
    () => new Set(this.destinations().map((airport) => airport.code)),
  );

  /** Countries with at least one direct flight from the first departure airport, by name. */
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
    origins: this.origins(),
    destination: this.destination(),
    destinationCountry: this.destinationCountry(),
  }));

  readonly isComplete = computed(
    () => !!this.origin() && (!!this.destination() || !!this.destinationCountry()),
  );

  readonly canAddOrigin = computed(() => this.isComplete() && this.origins().length < MAX_ORIGINS);

  /** The destination's country, for an airport or "any airport" destination. */
  readonly destinationCountryCode = computed(
    () => this.destinationAirport()?.countryCode ?? this.destinationCountry(),
  );

  /**
   * Airports with a direct flight to the destination. Routes run both ways, so these come from
   * the destination country's routes: one request, whatever the number of candidates.
   */
  private readonly servingDestination = computed<ReadonlySet<string> | null>(() => {
    const routes = this.routesByCountry()[this.destinationCountryCode() ?? ''];
    if (!routes) {
      return null;
    }
    const destination = this.destination();
    const byCode = this.airportsByCode();
    const fromDestination = routes.filter((route) =>
      destination ? route.origin === destination : !!byCode.get(route.origin),
    );
    return new Set(fromDestination.map((route) => route.destination));
  });

  /** Other airports that fly to the destination, closest to the first departure first. */
  readonly alternativeOrigins = computed<AlternativeOrigin[]>(() => {
    const first = this.originAirport();
    const serving = this.servingDestination();
    if (!first || !serving || !this.canAddOrigin()) {
      return [];
    }
    const chosen = new Set(this.origins());
    return [...serving]
      .filter((code) => !chosen.has(code))
      .map((code) => this.airportsByCode().get(code))
      .filter((airport): airport is Airport => !!airport)
      .map((airport) => ({ airport, km: distanceKm(first, airport) }))
      .sort((a, b) => a.km - b.km);
  });

  /** The alternatives within `NEARBY_KM`: suggested with one click. */
  readonly nearbyOrigins = computed(() =>
    this.alternativeOrigins().filter(({ km }) => km <= NEARBY_KM),
  );

  /** True while finding which airports fly to the destination. */
  readonly loadingAlternatives = computed(
    () => this.canAddOrigin() && this.loadingCountries().has(this.destinationCountryCode() ?? ''),
  );

  constructor() {
    // Which airports fly to the destination comes from the destination country's routes.
    effect(() => {
      const country = this.isComplete() ? this.destinationCountryCode() : null;
      if (country) {
        untracked(() => this.ensureRoutes(country));
      }
    });
  }

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

  /** Starts a new trip from this airport: clears the destination and the other departures. */
  selectOrigin(code: string): void {
    const airport = this.airportsByCode().get(code);
    if (!airport || (code === this.origin() && this.origins().length === 1)) {
      return;
    }
    this.origins.set([code]);
    this.clearDestination();
    this.ensureRoutes(airport.countryCode);
  }

  /** Adds an alternative departure airport; it must fly directly to the destination. */
  addOrigin(code: string): void {
    if (!this.airportsByCode().has(code) || !this.canAddOrigin() || this.origins().includes(code)) {
      return;
    }
    this.origins.update((origins) => [...origins, code]);
    this.dropUnserved();
  }

  /** Removes a departure airport; removing the first makes the next one the main departure. */
  removeOrigin(code: string): void {
    const remaining = this.origins().filter((origin) => origin !== code);
    if (!remaining.length) {
      this.clearOrigin();
      return;
    }
    this.origins.set(remaining);
    const first = this.originAirport();
    if (first) {
      this.ensureRoutes(first.countryCode);
    }
  }

  selectDestination(code: string): void {
    this.destination.set(code);
    this.destinationCountry.set(null);
    this.dropUnserved();
  }

  /** "Any airport in this country". */
  selectDestinationCountry(code: string): void {
    this.destination.set(null);
    this.destinationCountry.set(code);
    this.dropUnserved();
  }

  clearOrigin(): void {
    this.origins.set([]);
    this.clearDestination();
  }

  /** Clears the destination, and with it the extra departure airports. */
  clearDestination(): void {
    this.destination.set(null);
    this.destinationCountry.set(null);
    this.origins.update((origins) => origins.slice(0, 1));
  }

  /** Can the trip be reversed? Only one departure airport to one destination airport. */
  readonly canSwap = computed(() => this.origins().length === 1 && !!this.destination());

  /**
   * Flies the trip the other way. The return route is checked once its routes load: if it
   * doesn't exist, the destination is cleared.
   */
  swap(): void {
    const origin = this.origin();
    const destination = this.destination();
    if (!this.canSwap() || !origin || !destination) {
      return;
    }
    this.selectOrigin(destination);
    this.selectDestination(origin);
  }

  /**
   * Fills the whole trip at once (a saved route, a shared link). Returns false, and changes
   * nothing, when the airports aren't loaded yet or are no longer in Ryanair's network. Parts
   * without a direct flight (destination, extra departures) are dropped once routes load.
   */
  applyRoute(route: TripSearchSelection): boolean {
    const byCode = this.airportsByCode();
    const [first, ...extra] = route.origins;
    const known =
      !!first &&
      route.origins.every((code) => byCode.has(code)) &&
      (!route.destination || byCode.has(route.destination)) &&
      (!route.destinationCountry ||
        this.countries().some((country) => country.code === route.destinationCountry));
    if (!known) {
      return false;
    }
    this.selectOrigin(first);
    if (route.destination) {
      this.selectDestination(route.destination);
    } else if (route.destinationCountry) {
      this.selectDestinationCountry(route.destinationCountry);
    }
    extra.slice(0, MAX_ORIGINS - 1).forEach((code) => this.addOrigin(code));
    return true;
  }

  retry(): void {
    if (!this.airports().length) {
      this.loadAirports();
      return;
    }
    this.error.set('');
    for (const airport of this.originAirports()) {
      this.ensureRoutes(airport.countryCode);
    }
  }

  /** Airports with a direct flight from `code`, by name; empty until its routes load. */
  private destinationsFrom(code: string | null): Airport[] {
    const airport = this.airportsByCode().get(code ?? '');
    if (!airport) {
      return [];
    }
    const byCode = this.airportsByCode();
    return (this.routesByCountry()[airport.countryCode] ?? [])
      .filter((route) => route.origin === code)
      .map((route) => byCode.get(route.destination))
      .filter((destination): destination is Airport => !!destination)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Loads a country's routes once; a failed load can be retried. */
  private ensureRoutes(country: string): void {
    if (this.routesByCountry()[country] || this.loadingCountries().has(country)) {
      return;
    }
    this.loadingCountries.update((set) => new Set(set).add(country));
    this.network.getRoutes(country).subscribe({
      next: (routes) => {
        this.routesByCountry.update((all) => ({ ...all, [country]: routes }));
        this.stopLoading(country);
        this.dropUnserved();
      },
      error: () => {
        this.error.set('Could not load routes. Check that the backend is running.');
        this.stopLoading(country);
      },
    });
  }

  private stopLoading(country: string): void {
    this.loadingCountries.update((set) => {
      const next = new Set(set);
      next.delete(country);
      return next;
    });
  }

  /**
   * Once routes are known, drops what has no direct flight: a destination the first departure
   * doesn't fly to, then extra departures that don't fly to the destination (known once the
   * destination country's routes load).
   */
  private dropUnserved(): void {
    const first = this.originAirport();
    if (!first || !this.routesByCountry()[first.countryCode]) {
      return;
    }
    const destination = this.destination();
    const country = this.destinationCountry();
    const servedAirport = !destination || this.destinationCodes().has(destination);
    const servedCountry =
      !country || this.reachableCountries().some((reachable) => reachable.code === country);
    if (!servedAirport || !servedCountry) {
      this.clearDestination();
      return;
    }
    const serving = this.servingDestination();
    if (!serving) {
      return; // not known yet: checked again when the destination country's routes load
    }
    const keep = this.origins().filter((code, index) => index === 0 || serving.has(code));
    if (keep.length !== this.origins().length) {
      this.origins.set(keep);
    }
  }
}
