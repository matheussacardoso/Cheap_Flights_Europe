import { HttpTestingController } from '@angular/common/http/testing';
import { AirportCity, BusRoute } from '../services/bus-network-http-client';

/** Lisbon and Porto have a Flixbus city; so do Madrid and Malaga. Dublin and Marrakesh don't. */
export const AIRPORT_CITIES: AirportCity[] = [
  { airport: 'LIS', city: 'city-lisbon', cityName: 'Lisbon' },
  { airport: 'OPO', city: 'city-porto', cityName: 'Porto' },
  { airport: 'MAD', city: 'city-madrid', cityName: 'Madrid' },
  { airport: 'AGP', city: 'city-malaga', cityName: 'Malaga' },
];

/** From Porto: Madrid by a direct bus, Malaga with a change. */
export const BUS_ROUTES: Record<string, BusRoute[]> = {
  'city-porto': [
    { origin: 'city-porto', destination: 'city-madrid', destinationCountry: 'ES', direct: true },
    { origin: 'city-porto', destination: 'city-malaga', destinationCountry: 'ES', direct: false },
  ],
};

/**
 * Answers every open bus network request (the airport ↔ city links, bus routes) from the
 * fixtures. Pages load them on their own; most tests don't care.
 */
export function answerBusNetwork(
  http: HttpTestingController,
  airportCities: AirportCity[] = AIRPORT_CITIES,
): void {
  for (const request of http.match((req) => req.url.endsWith('/bus/airport-cities'))) {
    request.flush(airportCities);
  }
  for (const request of http.match((req) => req.url.endsWith('/bus/routes'))) {
    request.flush(BUS_ROUTES[request.request.params.get('origin') ?? ''] ?? []);
  }
}
