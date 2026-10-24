import { Routes } from '@angular/router';
import { FlightSearchComponent } from './components/flight-search/flight-search';
import { FlightResultsComponent } from './components/flight-results/flight-results';

export const routes: Routes = [
  { path: '', component: FlightSearchComponent },
  { path: 'results', component: FlightResultsComponent }
];