import { Injectable, computed, inject, signal } from '@angular/core';
import { TripSelection } from './trip-selection';

/** A trip the user saved to search again later. Stored in this browser only (no account). */
export interface SavedRoute {
  /** Stable key: the same trip can only be saved once. */
  id: string;
  originCountry: string;
  origin: string;
  /** Name shown in the list, e.g. "Lisbon". */
  originName: string;
  destinationCountry: string;
  /** Airport code, or null for "any airport in the destination country". */
  destination: string | null;
  /** Name shown in the list, e.g. "Malaga" or "Any airport in Spain". */
  destinationName: string;
}

export const SAVED_ROUTES_KEY = 'cheap-flights.saved-routes.v1';

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
    const origin = this.trip.originAirport();
    const airport = this.trip.destinationAirport();
    const country = this.trip
      .countries()
      .find((c) => c.code === (airport?.countryCode ?? this.trip.destinationCountry()));
    if (!origin || !country) {
      return null;
    }
    const destination = airport?.code ?? null;
    return {
      id: routeId(origin.code, destination, country.code),
      originCountry: origin.countryCode,
      origin: origin.code,
      originName: origin.name,
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
      origin: route.origin,
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

export function routeId(
  origin: string,
  destination: string | null,
  destinationCountry: string,
): string {
  return `${origin}-${destination ?? `any-${destinationCountry}`}`;
}

function readStorage(): SavedRoute[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_ROUTES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSavedRoute) : [];
  } catch {
    return [];
  }
}

/** Ignores entries written by an older or broken version instead of crashing on them. */
function isSavedRoute(value: unknown): value is SavedRoute {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const route = value as Record<string, unknown>;
  const strings = [
    'id',
    'originCountry',
    'origin',
    'originName',
    'destinationCountry',
    'destinationName',
  ];
  return (
    strings.every((key) => typeof route[key] === 'string') &&
    (route['destination'] === null || typeof route['destination'] === 'string')
  );
}
