import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL, toHttpParams } from './api';
import { Weekday } from './trip-period';

export interface FlightResponse {
  flightNumber: string;
  origin: string;
  destination: string;
  /** Local to each airport, without an offset (see `Airport.timeZone`). */
  departureTime: string;
  arrivalTime?: string | null;
  price: number;
  currency: string;
}

export interface FlightSearchParams {
  /** 1 to 3 departure airports, sent as a repeated `origin` param. */
  origin: string[];
  date_from: string;
  destination?: string;
  destination_country?: string;
  date_to?: string;
  currency?: string;
}

/** Mirrors backend `TripResponse`: a round trip on fixed weekdays. */
export interface TripResponse {
  totalPrice: number;
  outbound: FlightResponse;
  inbound: FlightResponse;
}

/** Mirrors backend `TripSearchParams`. Day names are lowercase English, e.g. `thursday`. */
export interface TripSearchParams {
  /** 1 to 3 departure airports, sent as a repeated `origin` param. */
  origin: string[];
  date_from: string;
  date_to: string;
  depart_day: Weekday;
  return_day: Weekday;
  destination?: string;
  destination_country?: string;
  currency?: string;
}

/**
 * Fare searches on the backend's `/flights/*` endpoints. Stateless: the results of the last
 * search are kept in `SearchResults`.
 */
@Injectable({ providedIn: 'root' })
export class FlightHttpClient {
  private readonly http = inject(HttpClient);

  searchFlights(params: FlightSearchParams): Observable<FlightResponse[]> {
    return this.http.get<FlightResponse[]>(`${API_BASE_URL}/flights/cheapest`, {
      params: toHttpParams(params),
    });
  }

  searchTrips(params: TripSearchParams): Observable<TripResponse[]> {
    return this.http.get<TripResponse[]>(`${API_BASE_URL}/flights/trips`, {
      params: toHttpParams(params),
    });
  }
}
