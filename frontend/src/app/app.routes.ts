import { Routes } from '@angular/router';
import { FlightResultsComponent } from './components/flight-results/flight-results';
import { FlightSearchComponent } from './components/flight-search/flight-search';
import { RoutesPageComponent } from './components/routes-page/routes-page';
import { TripResultsComponent } from './components/trip-results/trip-results';

export const routes: Routes = [
  { path: '', component: RoutesPageComponent, title: 'Routes · Cheap Flights Europe' },
  { path: 'search', component: FlightSearchComponent, title: 'Search · Cheap Flights Europe' },
  {
    path: 'search/results',
    component: FlightResultsComponent,
    title: 'Results · Cheap Flights Europe',
  },
  {
    path: 'search/trips',
    component: TripResultsComponent,
    title: 'Cheapest dates · Cheap Flights Europe',
  },
  { path: 'results', redirectTo: 'search/results' },
  { path: '**', redirectTo: '' },
];
