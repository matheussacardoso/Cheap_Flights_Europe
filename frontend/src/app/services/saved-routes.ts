import { Injectable, computed, inject, signal } from '@angular/core';
import { TripSelection } from './trip-selection';

/** A trip the user saved to search again later. Stored in this browser only (no account). */
export interface SavedRoute {
  /** Stable key: the same trip can only be saved once. */
  id: string;
  /** Country of the first departure airport (its flag is shown). */
  originCountry: string;
  /** Departure airports: the first is the main one, the others alternatives near it. */
  origins: string[];
  /** Name shown in the list, e.g. "Cologne" or "Cologne + Dusseldorf Weeze". */
  originName: string;
  destinationCountry: string;
  /** Airport code, or null for "any airport in the destination country". */
  destination: string | null;
  /** Name shown in the list, e.g. "Malaga" or "Any airport in Spain". */
  destinationName: string;
}

export const SAVED_ROUTES_KEY = 'cheap-flights.saved-routes.v2';
/** Routes saved before several departure airports existed; migrated on first read. */
export const SAVED_ROUTES_KEY_V1 = 'cheap-flights.saved-routes.v1';

/**
 * The user's saved routes, kept in `localStorage`. Storage can be unavailable (private windows,
 * blocked site data): the list then still works for the current visit, it just isn't kept.
 */
@Injectable({ providedIn: 'root' })
export class SavedRoutes {
  private trip = inject(TripSelection);

  readonly routes = signal<SavedRoute[]>(readStorage());

  /** The trip currently chosen, as a route that can be saved; null if incomplete. */
  readonly current = computed<SavedRoute | null>(() => {
    const origins = this.trip.originAirports();
    const airport = this.trip.destinationAirport();
    const country = this.trip
      .countries()
      .find((c) => c.code === (airport?.countryCode ?? this.trip.destinationCountry()));
    if (!origins.length || !country) {
      return null;
    }
    const destination = airport?.code ?? null;
    const codes = origins.map((origin) => origin.code);
    return {
      id: routeId(codes, destination, country.code),
      originCountry: origins[0].countryCode,
      origins: codes,
      originName: origins.map((origin) => origin.name).join(' + '),
      destinationCountry: country.code,
      destination,
      destinationName: airport?.name ?? `Any airport in ${country.name}`,
    };
  });

  readonly isCurrentSaved = computed(() => {
    const current = this.current();
    return !!current && this.routes().some((route) => route.id === current.id);
  });

  /** Saves the current trip, or removes it if it is already saved. */
  toggleCurrent(): void {
    const current = this.current();
    if (!current) {
      return;
    }
    if (this.isCurrentSaved()) {
      this.remove(current.id);
    } else {
      this.update([current, ...this.routes()]);
    }
  }

  remove(id: string): void {
    this.update(this.routes().filter((route) => route.id !== id));
  }

  /** Makes a saved route the current trip; false if its airports are no longer served. */
  use(route: SavedRoute): boolean {
    return this.trip.applyRoute({
      origins: route.origins,
      destination: route.destination,
      destinationCountry: route.destination ? null : route.destinationCountry,
    });
  }

  private update(routes: SavedRoute[]): void {
    this.routes.set(routes);
    try {
      localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
    } catch {
      // Storage unavailable or full: keep the list for this visit only.
    }
  }
}

/** "CGN-PMI", "CGN+NRN-PMI" or "CGN-any-ES". */
export function routeId(
  origins: string[],
  destination: string | null,
  destinationCountry: string,
): string {
  return `${origins.join('+')}-${destination ?? `any-${destinationCountry}`}`;
}

function readStorage(): SavedRoute[] {
  try {
    const current = parse(localStorage.getItem(SAVED_ROUTES_KEY));
    if (current) {
      return current.filter(isSavedRoute);
    }
    // First visit since several departures: bring the v1 routes over (one origin each).
    const v1 = (parse(localStorage.getItem(SAVED_ROUTES_KEY_V1)) ?? []).flatMap(fromV1);
    if (v1.length) {
      localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(v1));
    }
    return v1;
  } catch {
    return [];
  }
}

function parse(json: string | null): unknown[] | null {
  if (json === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** A v1 route had a single `origin` string; invalid entries are skipped. */
function fromV1(value: unknown): SavedRoute[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const { origin, ...rest } = value as Record<string, unknown>;
  const route = { ...rest, origins: [origin] } as Record<string, unknown>;
  if (!isSavedRoute(route)) {
    return [];
  }
  return [{ ...route, id: routeId(route.origins, route.destination, route.destinationCountry) }];
}

/** Ignores entries written by an older or broken version instead of crashing on them. */
function isSavedRoute(value: unknown): value is SavedRoute {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const route = value as Record<string, unknown>;
  const strings = ['id', 'originCountry', 'originName', 'destinationCountry', 'destinationName'];
  const origins = route['origins'];
  return (
    strings.every((key) => typeof route[key] === 'string') &&
    Array.isArray(origins) &&
    origins.length > 0 &&
    origins.every((code) => typeof code === 'string') &&
    (route['destination'] === null || typeof route['destination'] === 'string')
  );
}
