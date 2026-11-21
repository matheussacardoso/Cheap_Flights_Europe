import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import {
  MatActionList,
  MatListItem,
  MatListItemAvatar,
  MatListItemLine,
  MatListItemTitle,
} from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { FlagUrlPipe } from '../../pipes/flag-url-pipe';
import { BusAvailability } from '../../services/bus-availability';
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
  imports: [
    FlagUrlPipe,
    LoadingIndicator,
    MatActionList,
    MatButton,
    MatCard,
    MatCardContent,
    MatIcon,
    MatListItem,
    MatListItemAvatar,
    MatListItemLine,
    MatListItemTitle,
    RouterLink,
    SavedRoutesList,
    TripFields,
    TripMap,
  ],
  templateUrl: './routes-page.html',
  styleUrl: './routes-page.css',
})
export class RoutesPage {
  protected readonly trip = inject(TripSelection);
  protected readonly savedRoutes = inject(SavedRoutes);
  private readonly bus = inject(BusAvailability);

  protected readonly searchParams = computed(() => tripQueryParams(this.trip.searchSelection()));

  /** The direct destinations, each with a tag when Flixbus goes there too. */
  protected readonly destinations = computed(() => {
    const byBus = this.bus.busToAirport();
    return this.trip.destinations().map((airport) => {
      const direct = byBus.get(airport.code);
      return {
        airport,
        busTag: direct === undefined ? '' : direct ? 'Bus too' : 'Bus with a change',
      };
    });
  });

  constructor() {
    this.trip.loadAirports();
    this.bus.load();
    syncTripWithUrl();
  }
}
