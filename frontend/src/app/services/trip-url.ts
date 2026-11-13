import { effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { TripSearchSelection, TripSelection } from './trip-selection';

/**
 * The trip as query params, e.g. `?from=CGN&to=PMI`, `?from=OPO&to_country=ES`, or with several
 * departure airports `?from=CGN,NRN&to=PMI`.
 */
export function tripQueryParams(trip: TripSearchSelection): Params {
  return {
    from: trip.origins.length ? trip.origins.join(',') : undefined,
    to: trip.destination ?? undefined,
    to_country: trip.destinationCountry ?? undefined,
  };
}

/**
 * Keeps the current page's URL and the trip in sync, so a reload or a shared link keeps the
 * route. On load, a trip in the URL wins (once the airports arrive); after that, every change to
 * the trip replaces the URL's query params. Call from a page component's constructor.
 */
export function syncTripWithUrl(): void {
  const trip = inject(TripSelection);
  const router = inject(Router);
  const route = inject(ActivatedRoute);

  const params = route.snapshot.queryParamMap;
  const fromUrl: TripSearchSelection = {
    origins: (params.get('from') ?? '')
      .toUpperCase()
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean),
    destination: params.get('to')?.toUpperCase() ?? null,
    destinationCountry: params.get('to_country')?.toUpperCase() ?? null,
  };
  const restored = signal(!fromUrl.origins.length);

  effect(() => {
    if (restored() || !trip.airports().length) {
      return;
    }
    untracked(() => trip.applyRoute(fromUrl));
    restored.set(true);
  });

  effect(() => {
    if (!restored()) {
      return;
    }
    const queryParams = tripQueryParams(trip.searchSelection());
    untracked(() => router.navigate([], { relativeTo: route, queryParams, replaceUrl: true }));
  });
}
