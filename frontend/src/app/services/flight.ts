import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api';

export interface FlightResponse {
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
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
  depart_day: string;
  return_day: string;
  destination?: string;
  destination_country?: string;
  currency?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FlightService {
  private apiUrl = `${API_BASE_URL}/flights/cheapest`;
  public searchResults: FlightResponse[] = [];
  /** Round trips from the last weekday search, cheapest first. */
  public tripResults: TripResponse[] = [];

  constructor(private http: HttpClient) {}

  searchFlights(params: FlightSearchParams): Observable<FlightResponse[]> {
    let httpParams = new HttpParams()
      .appendAll({ origin: params.origin })
      .set('date_from', params.date_from);

    if (params.destination) {
      httpParams = httpParams.set('destination', params.destination);
    }
    if (params.destination_country) {
      httpParams = httpParams.set('destination_country', params.destination_country);
    }
    if (params.date_to) {
      httpParams = httpParams.set('date_to', params.date_to);
    }
    if (params.currency) {
      httpParams = httpParams.set('currency', params.currency);
    }

    return this.http.get<FlightResponse[]>(this.apiUrl, { params: httpParams }).pipe(
      tap((results) => {
        this.searchResults = results;
      }),
    );
  }

  searchTrips(params: TripSearchParams): Observable<TripResponse[]> {
    // HttpParams skips nothing by itself: drop the optional fields that aren't set.
    const set = Object.entries(params).filter(([, value]) => !!value && value.length !== 0);
    const httpParams = new HttpParams({ fromObject: Object.fromEntries(set) });
    return this.http
      .get<TripResponse[]>(`${API_BASE_URL}/flights/trips`, { params: httpParams })
      .pipe(tap((results) => (this.tripResults = results)));
  }
}
