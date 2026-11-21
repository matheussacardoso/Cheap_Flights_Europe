import { Injectable, signal } from '@angular/core';
import { BusTripResponse } from './bus-http-client';
import { FlightResponse, TripResponse } from './flight-http-client';

/**
 * Results of the last search, read by the results pages. Kept in memory only: a reload loses
 * them, and the pages then show their empty state.
 */
@Injectable({ providedIn: 'root' })
export class SearchResults {
  private readonly flightsState = signal<FlightResponse[]>([]);
  private readonly tripsState = signal<TripResponse[]>([]);
  private readonly busTripsState = signal<BusTripResponse[]>([]);
  private readonly busNoteState = signal('');

  /** One-way flights from the last search. */
  readonly flights = this.flightsState.asReadonly();
  /** Round trips from the last weekday search, cheapest first. */
  readonly trips = this.tripsState.asReadonly();
  /** Flixbus round trips for the same search, to compare with the flights. */
  readonly busTrips = this.busTripsState.asReadonly();
  /** Why buses weren't compared (no Flixbus city, search failed…); '' when they were. */
  readonly busNote = this.busNoteState.asReadonly();

  setFlights(flights: FlightResponse[]): void {
    this.flightsState.set(flights);
  }

  setTrips(trips: TripResponse[]): void {
    this.tripsState.set(trips);
  }

  setBusTrips(trips: BusTripResponse[], note = ''): void {
    this.busTripsState.set(trips);
    this.busNoteState.set(note);
  }
}
