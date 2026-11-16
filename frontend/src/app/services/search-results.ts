import { Injectable, signal } from '@angular/core';
import { FlightResponse, TripResponse } from './flight-http-client';

/**
 * Results of the last search, read by the results pages. Kept in memory only: a reload loses
 * them, and the pages then show their empty state.
 */
@Injectable({ providedIn: 'root' })
export class SearchResults {
  private readonly flightsState = signal<FlightResponse[]>([]);
  private readonly tripsState = signal<TripResponse[]>([]);

  /** One-way flights from the last search. */
  readonly flights = this.flightsState.asReadonly();
  /** Round trips from the last weekday search, cheapest first. */
  readonly trips = this.tripsState.asReadonly();

  setFlights(flights: FlightResponse[]): void {
    this.flightsState.set(flights);
  }

  setTrips(trips: TripResponse[]): void {
    this.tripsState.set(trips);
  }
}
