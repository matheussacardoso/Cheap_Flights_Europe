import { Routes } from '@angular/router';

// Each page is its own lazy chunk: the map (d3) isn't downloaded to open Search, and vice versa.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/routes-page/routes-page').then((m) => m.RoutesPage),
    title: 'Routes · Cheap Flights Europe',
  },
  {
    path: 'search',
    loadComponent: () => import('./components/search-page/search-page').then((m) => m.SearchPage),
    title: 'Search · Cheap Flights Europe',
  },
  {
    path: 'search/results',
    loadComponent: () =>
      import('./components/flight-results-page/flight-results-page').then(
        (m) => m.FlightResultsPage,
      ),
    title: 'Results · Cheap Flights Europe',
  },
  {
    path: 'search/trips',
    loadComponent: () =>
      import('./components/trip-results-page/trip-results-page').then((m) => m.TripResultsPage),
    title: 'Cheapest dates · Cheap Flights Europe',
  },
  { path: 'results', redirectTo: 'search/results' },
  { path: '**', redirectTo: '' },
];
