import { Component, inject, signal } from '@angular/core';
import { SavedRoute, SavedRoutes } from '../../services/saved-routes';
import { TripSelection } from '../../services/trip-selection';

/** The user's saved routes: one click makes a route the current trip. */
@Component({
  selector: 'app-saved-routes',
  standalone: true,
  templateUrl: './saved-routes.html',
  styleUrl: './saved-routes.css',
})
export class SavedRoutesComponent {
  readonly saved = inject(SavedRoutes);
  readonly trip = inject(TripSelection);

  /** Feedback for screen readers and for routes that can't be used any more. */
  readonly message = signal('');

  name(route: SavedRoute): string {
    return `${route.originName} to ${route.destinationName}`;
  }

  use(route: SavedRoute): void {
    if (!this.trip.airports().length) {
      return;
    }
    this.message.set(
      this.saved.use(route)
        ? `${this.name(route)} selected.`
        : `${this.name(route)} is no longer served by Ryanair.`,
    );
  }

  remove(route: SavedRoute): void {
    this.saved.remove(route.id);
    this.message.set(`${this.name(route)} removed from saved routes.`);
  }
}
