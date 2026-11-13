import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FlightService, TripResponse } from '../../services/flight';
import { TripSelection } from '../../services/trip-selection';

/** Round trips found for the chosen weekdays, cheapest first. */
@Component({
  selector: 'app-trip-results',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './trip-results.html',
  styleUrl: './trip-results.css',
})
export class TripResultsComponent {
  private trip = inject(TripSelection);
  readonly trips: TripResponse[] = inject(FlightService).tripResults;

  /** "Palma de Mallorca" for PMI once airports are loaded, else the code. */
  airportName(code: string): string {
    return this.trip.airportsByCode().get(code)?.name ?? code;
  }
}
