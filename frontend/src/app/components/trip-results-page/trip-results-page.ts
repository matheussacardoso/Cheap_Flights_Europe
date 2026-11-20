import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TripResponse } from '../../services/flight-http-client';
import { SearchResults } from '../../services/search-results';
import { TripSelection } from '../../services/trip-selection';

/** A trip as the table shows it: airport names already looked up. */
interface TripRow {
  trip: TripResponse;
  destinationName: string;
  outboundOriginName: string;
  inboundDestinationName: string;
}

/** Round trips found for the chosen weekdays, cheapest first. */
@Component({
  selector: 'app-trip-results-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './trip-results-page.html',
  styleUrl: './trip-results-page.css',
})
export class TripResultsPage {
  private readonly trip = inject(TripSelection);
  private readonly results = inject(SearchResults);

  protected readonly rows = computed<TripRow[]>(() => {
    // "Palma de Mallorca" for PMI once airports are loaded, else the code.
    const byCode = this.trip.airportsByCode();
    const nameOf = (code: string) => byCode.get(code)?.name ?? code;
    return this.results.trips().map((trip) => ({
      trip,
      destinationName: nameOf(trip.outbound.destination),
      outboundOriginName: nameOf(trip.outbound.origin),
      inboundDestinationName: nameOf(trip.inbound.destination),
    }));
  });
}
