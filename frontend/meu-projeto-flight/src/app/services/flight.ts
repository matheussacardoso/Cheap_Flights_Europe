import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface FlightResponse {
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  price: number;
  currency: string;
}

export interface FlightSearchParams {
  origin: string;
  date_from: string;
  destination?: string;
  date_to?: string;
  currency?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FlightService {
  private apiUrl = 'http://127.0.0.1:8000/flights/cheapest';
  public searchResults: FlightResponse[] = [];

  constructor(private http: HttpClient) {}

  searchFlights(params: FlightSearchParams): Observable<FlightResponse[]> {
    let httpParams = new HttpParams()
      .set('origin', params.origin)
      .set('date_from', params.date_from);

    if (params.destination) {
      httpParams = httpParams.set('destination', params.destination);
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
      })
    );
  }
}