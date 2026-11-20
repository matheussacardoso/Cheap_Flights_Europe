import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FlagUrlPipe } from '../../pipes/flag-url-pipe';
import { SavedRoutes } from '../../services/saved-routes';
import { tripQueryParams, syncTripWithUrl } from '../../services/trip-url';
import { TripSelection } from '../../services/trip-selection';
import { LoadingIndicator } from '../loading-indicator/loading-indicator';
import { SavedRoutesList } from '../saved-routes-list/saved-routes-list';
import { TripFields } from '../trip-fields/trip-fields';
import { TripMap } from '../trip-map/trip-map';

/**
 * Explore Ryanair's network: a full-size map beside a sidebar with From/To, the direct
 * destinations of the chosen airport and the saved routes. A complete trip links to Search.
 */
@Component({
  selector: 'app-routes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlagUrlPipe, LoadingIndicator, RouterLink, SavedRoutesList, TripFields, TripMap],
  templateUrl: './routes-page.html',
  styleUrl: './routes-page.css',
})
export class RoutesPage {
  protected readonly trip = inject(TripSelection);
  protected readonly savedRoutes = inject(SavedRoutes);

  protected readonly searchParams = computed(() => tripQueryParams(this.trip.searchSelection()));

  constructor() {
    this.trip.loadAirports();
    syncTripWithUrl();
  }
}
