import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SavedRoutes } from '../../services/saved-routes';
import { tripQueryParams, syncTripWithUrl } from '../../services/trip-url';
import { TripSelection } from '../../services/trip-selection';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';
import { SavedRoutesComponent } from '../saved-routes/saved-routes';
import { TripFieldsComponent } from '../trip-fields/trip-fields';
import { TripMapComponent } from '../trip-map/trip-map';

/**
 * Explore Ryanair's network: a full-size map beside a sidebar with From/To, the direct
 * destinations of the chosen airport and the saved routes. A complete trip links to Search.
 */
@Component({
  selector: 'app-routes-page',
  standalone: true,
  imports: [
    LoadingIndicatorComponent,
    RouterLink,
    SavedRoutesComponent,
    TripFieldsComponent,
    TripMapComponent,
  ],
  templateUrl: './routes-page.html',
  styleUrl: './routes-page.css',
})
export class RoutesPageComponent {
  readonly trip = inject(TripSelection);
  readonly savedRoutes = inject(SavedRoutes);

  readonly searchParams = computed(() => tripQueryParams(this.trip.searchSelection()));

  constructor() {
    this.trip.loadAirports();
    syncTripWithUrl();
  }
}
