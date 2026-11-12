import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { API_BASE_URL } from './api';

/** Mirrors backend `AirportResponse`. */
export interface Airport {
  code: string;
  name: string;
  city: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
}

/** Mirrors backend `RouteResponse`. */
export interface Route {
  origin: string;
  destination: string;
  seasonal: boolean;
}

/** Ryanair's route network: airports and direct routes. Responses are cached for the session. */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private http = inject(HttpClient);
  private airports$?: Observable<Airport[]>;
  private routes$ = new Map<string, Observable<Route[]>>();

  getAirports(): Observable<Airport[]> {
    this.airports$ ??= this.http
      .get<Airport[]>(`${API_BASE_URL}/network/airports`)
      .pipe(shareReplay(1));
    return this.airports$;
  }

  getRoutes(originCountry: string): Observable<Route[]> {
    let routes$ = this.routes$.get(originCountry);
    if (!routes$) {
      const params = new HttpParams().set('origin_country', originCountry);
      routes$ = this.http
        .get<Route[]>(`${API_BASE_URL}/network/routes`, { params })
        .pipe(shareReplay(1));
      this.routes$.set(originCountry, routes$);
    }
    return routes$;
  }
}
