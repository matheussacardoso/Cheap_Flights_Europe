import { Routes } from '@angular/router';

// Each page is its own lazy chunk: the map (d3) isn't downloaded to open Search, and vice versa.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/routes-page/routes-page').then((m) => m.RoutesPage),
    title: 'Routes · Explore with me',
  },
  {
    path: 'search',
    loadComponent: () => import('./components/search-page/search-page').then((m) => m.SearchPage),
    title: 'Search · Explore with me',
  },
  {
    path: 'search/results',
    loadComponent: () =>
      import('./components/flight-results-page/flight-results-page').then(
        (m) => m.FlightResultsPage,
      ),
    title: 'Results · Explore with me',
  },
  {
    path: 'search/trips',
    loadComponent: () =>
      import('./components/trip-results-page/trip-results-page').then((m) => m.TripResultsPage),
    title: 'Cheapest dates · Explore with me',
  },
  { path: 'results', redirectTo: 'search/results' },
  { path: '**', redirectTo: '' },
];
