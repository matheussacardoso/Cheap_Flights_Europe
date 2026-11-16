import { Injectable, computed, inject, signal } from '@angular/core';
import { BROWSER_STORAGE } from './browser-storage';
import { MAX_ORIGINS, TripSelection } from './trip-selection';

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

/** Name of the downloaded file. */
export const ROUTES_FILE_NAME = 'cheap-flights-routes.json';
/** Version of the file format; bump it when the shape of a file route changes. */
export const ROUTES_FILE_VERSION = 1;
/** Larger files can't be routes files (one route is under 100 bytes): they aren't read. */
export const ROUTES_FILE_MAX_BYTES = 1_000_000;

/** A route in the file: only codes. Names are looked up again on upload. */
export interface FileRoute {
  origins: string[];
  destination: string | null;
  destinationCountry: string;
}

/** What uploading a file did. */
export interface ImportResult {
  added: number;
  /** Already in the list (same airports): not added twice. */
  alreadySaved: number;
  /** Invalid, or with airports Ryanair doesn't serve any more: skipped. */
  skipped: number;
}

/**
 * The user's saved routes, kept in `localStorage`. Storage can be unavailable (private windows,
 * blocked site data): the list then still works for the current visit, it just isn't kept.
 */
@Injectable({ providedIn: 'root' })
export class SavedRoutes {
  private readonly trip = inject(TripSelection);
  private readonly storage = inject(BROWSER_STORAGE);

  readonly routes = signal<SavedRoute[]>(readStorage(this.storage));

  /** The trip currently chosen, as a route that can be saved; null if incomplete. */
  readonly current = computed<SavedRoute | null>(() =>
    this.build({
      origins: this.trip.origins(),
      destination: this.trip.destination(),
      destinationCountry: this.trip.destinationCountry() ?? '',
    }),
  );

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

  /** The saved routes as a JSON file, to keep or to upload in another browser. */
  toFile(): string {
    const routes: FileRoute[] = this.routes().map(
      ({ origins, destination, destinationCountry }) => ({
        origins,
        destination,
        destinationCountry,
      }),
    );
    return JSON.stringify(
      { app: 'cheap-flights-europe', version: ROUTES_FILE_VERSION, routes },
      null,
      2,
    );
  }

  /**
   * Adds the routes of an uploaded file after the saved ones. Returns null when the text isn't
   * a routes file at all. Needs the airports to be loaded: names come from them.
   */
  importFile(text: string): ImportResult | null {
    const entries = fileEntries(text);
    if (!entries) {
      return null;
    }
    const result: ImportResult = { added: 0, alreadySaved: 0, skipped: 0 };
    const routes = [...this.routes()];
    for (const entry of entries) {
      const route = this.build(asFileRoute(entry));
      if (!route) {
        result.skipped++;
      } else if (routes.some((saved) => saved.id === route.id)) {
        result.alreadySaved++;
      } else {
        routes.push(route);
        result.added++;
      }
    }
    if (result.added) {
      this.update(routes);
    }
    return result;
  }

  /**
   * A full saved route from codes, or null if an airport or country is unknown. For an airport
   * destination, its country comes from the airport, not from the input.
   */
  private build(route: FileRoute | null): SavedRoute | null {
    const byCode = this.trip.airportsByCode();
    const origins = route?.origins.map((code) => byCode.get(code));
    if (!route || !origins?.length || origins.length > MAX_ORIGINS) {
      return null;
    }
    const airport = route.destination ? byCode.get(route.destination) : null;
    const countryCode = route.destination ? airport?.countryCode : route.destinationCountry;
    const country = this.trip.countries().find((c) => c.code === countryCode);
    if (
      !country ||
      (route.destination && !airport) ||
      origins.some((origin) => !origin || origin.code === route.destination)
    ) {
      return null;
    }
    const known = origins.filter((origin) => !!origin);
    const codes = known.map((origin) => origin.code);
    const destination = airport?.code ?? null;
    return {
      id: routeId(codes, destination, country.code),
      originCountry: known[0].countryCode,
      origins: codes,
      originName: known.map((origin) => origin.name).join(' + '),
      destinationCountry: country.code,
      destination,
      destinationName: airport?.name ?? `Any airport in ${country.name}`,
    };
  }

  private update(routes: SavedRoute[]): void {
    this.routes.set(routes);
    try {
      this.storage?.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
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

/**
 * The route entries of a routes file: `{"routes": [...]}`, or a bare list. Null if it isn't JSON,
 * has another shape, or comes from a newer version of the app.
 */
function fileEntries(text: string): unknown[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { routes, version } = value as Record<string, unknown>;
  if (!Array.isArray(routes) || (typeof version === 'number' && version > ROUTES_FILE_VERSION)) {
    return null;
  }
  return routes;
}

/** Reads one file entry, tolerating lowercase codes and repeated departures; null if invalid. */
function asFileRoute(value: unknown): FileRoute | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { origins, destination, destinationCountry } = value as Record<string, unknown>;
  const code = (text: unknown) => (typeof text === 'string' ? text.trim().toUpperCase() : null);
  const originCodes = Array.isArray(origins) ? origins.map(code) : [];
  if (!originCodes.length || !originCodes.every((origin): origin is string => !!origin)) {
    return null;
  }
  if (destination !== null && destination !== undefined && !code(destination)) {
    return null;
  }
  return {
    origins: [...new Set(originCodes)],
    destination: code(destination),
    destinationCountry: code(destinationCountry) ?? '',
  };
}

function readStorage(storage: Storage | null): SavedRoute[] {
  if (!storage) {
    return [];
  }
  try {
    const current = parse(storage.getItem(SAVED_ROUTES_KEY));
    if (current) {
      return current.filter(isSavedRoute);
    }
    // First visit since several departures: bring the v1 routes over (one origin each).
    const v1 = (parse(storage.getItem(SAVED_ROUTES_KEY_V1)) ?? []).flatMap(fromV1);
    if (v1.length) {
      storage.setItem(SAVED_ROUTES_KEY, JSON.stringify(v1));
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
