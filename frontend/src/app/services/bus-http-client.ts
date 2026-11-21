import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL, toHttpParams } from './api';
import { TripSearchParams } from './flight-http-client';

/** Mirrors backend `BusRideResponse`. Times carry their offset, e.g. `+01:00`. */
export interface BusRideResponse {
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  price: number;
  currency: string;
  transfers: number;
  /** Names of the cities where the ride changes bus, e.g. ["Karlsruhe", "Lyon"]. */
  via: string[];
}

/** Mirrors backend `BusTripResponse`. */
export interface BusTripResponse {
  totalPrice: number;
  outbound: BusRideResponse;
  inbound: BusRideResponse;
}

/**
 * Bus fare searches on the backend's `/bus/trips`. The query params are the same as for
 * flights, with Flixbus city ids instead of airport codes.
 */
@Injectable({ providedIn: 'root' })
export class BusHttpClient {
  private readonly http = inject(HttpClient);

  searchTrips(params: TripSearchParams): Observable<BusTripResponse[]> {
    return this.http.get<BusTripResponse[]>(`${API_BASE_URL}/bus/trips`, {
      params: toHttpParams(params),
    });
  }
}
