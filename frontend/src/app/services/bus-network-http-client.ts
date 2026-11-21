import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { API_BASE_URL } from './api';

/** Mirrors backend `AirportCityResponse`: the Flixbus city that stands for a Ryanair airport. */
export interface AirportCity {
  airport: string;
  /** Flixbus city id (a UUID). */
  city: string;
  cityName: string;
}

/** Mirrors backend `BusRouteResponse`: `direct` is false when the trip needs a change. */
export interface BusRoute {
  origin: string;
  destination: string;
  destinationCountry: string;
  direct: boolean;
}

/** Flixbus's network on the backend's `/bus/*`. Responses are cached for the session. */
@Injectable({ providedIn: 'root' })
export class BusNetworkHttpClient {
  private readonly http = inject(HttpClient);
  private airportCities$?: Observable<AirportCity[]>;
  private readonly originToRoutes$ = new Map<string, Observable<BusRoute[]>>();

  /** The Flixbus city of each Ryanair airport that has one (about 177 of 222). */
  fetchAirportCities(): Observable<AirportCity[]> {
    this.airportCities$ ??= this.http
      .get<AirportCity[]>(`${API_BASE_URL}/bus/airport-cities`)
      .pipe(shareReplay(1));
    return this.airportCities$;
  }

  /** Every city reachable by bus from `origin` (a city id), directly or with a change. */
  fetchRoutes(origin: string): Observable<BusRoute[]> {
    let routes$ = this.originToRoutes$.get(origin);
    if (!routes$) {
      const params = new HttpParams().set('origin', origin);
      routes$ = this.http
        .get<BusRoute[]>(`${API_BASE_URL}/bus/routes`, { params })
        .pipe(shareReplay(1));
      this.originToRoutes$.set(origin, routes$);
    }
    return routes$;
  }
}
