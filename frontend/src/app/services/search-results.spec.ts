import { TestBed } from '@angular/core/testing';
import { FlightResponse, TripResponse } from './flight-http-client';
import { SearchResults } from './search-results';

const FLIGHT: FlightResponse = {
  flightNumber: 'FR 1234',
  origin: 'OPO',
  destination: 'MAD',
  departureTime: '2026-12-10T10:00:00',
  price: 29.99,
  currency: 'EUR',
};

describe('SearchResults', () => {
  it('starts empty', () => {
    const results = TestBed.inject(SearchResults);
    expect(results.flights()).toEqual([]);
    expect(results.trips()).toEqual([]);
  });

  it('keeps the last one-way and round-trip results apart', () => {
    const results = TestBed.inject(SearchResults);
    const trip: TripResponse = { totalPrice: 59.98, outbound: FLIGHT, inbound: FLIGHT };

    results.setFlights([FLIGHT]);
    results.setTrips([trip]);

    expect(results.flights()).toEqual([FLIGHT]);
    expect(results.trips()).toEqual([trip]);
  });
});
