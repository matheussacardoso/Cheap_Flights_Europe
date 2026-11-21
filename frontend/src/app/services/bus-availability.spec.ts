import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AIRPORT_CITIES, answerBusNetwork } from '../testing/bus-fixtures';
import { AIRPORTS, PT_ROUTES, answerRoutes, routesFor } from '../testing/network-fixtures';
import { BusAvailability } from './bus-availability';
import { TripSelection } from './trip-selection';

describe('BusAvailability', () => {
  let bus: BusAvailability;
  let trip: TripSelection;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    bus = TestBed.inject(BusAvailability);
    trip = TestBed.inject(TripSelection);
    http = TestBed.inject(HttpTestingController);
    trip.airports.set(AIRPORTS);
  });

  afterEach(() => {
    answerRoutes(http);
    answerBusNetwork(http);
    http.verify();
  });

  /** Porto to `destination`, with Porto's routes loaded. */
  function flyFromPorto(destination: string): void {
    trip.selectOrigin('OPO');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    trip.selectDestination(destination);
    TestBed.tick();
  }

  function load(): void {
    bus.load();
    http.expectOne((req) => req.url.endsWith('/bus/airport-cities')).flush(AIRPORT_CITIES);
    TestBed.tick();
  }

  it('asks for nothing until a page loads it', () => {
    flyFromPorto('MAD');
    http.expectNone((req) => req.url.includes('/bus/'));
    expect(bus.compareNote()).toBe('Checking Flixbus…');
  });

  it("marks the destinations the departure city's buses reach", () => {
    load();
    flyFromPorto('MAD');
    answerBusNetwork(http);

    // Porto: Madrid by a direct bus, Malaga with a change; Marrakesh has no Flixbus city.
    expect([...bus.busToAirport()]).toEqual([
      ['MAD', true],
      ['AGP', false],
    ]);
  });

  it('compares a trip between two airports with Flixbus cities', () => {
    load();
    flyFromPorto('MAD');

    expect(bus.canCompare()).toBe(true);
    expect(bus.busTrip().origins.map((origin) => origin.cityName)).toEqual(['Porto']);
    expect(bus.busTrip().destination?.cityName).toBe('Madrid');
  });

  it('explains why a trip cannot be compared', () => {
    load();
    flyFromPorto('RAK');
    expect(bus.compareNote()).toBe("Flixbus doesn't go to RAK Airport: flights only.");

    trip.selectDestinationCountry('ES');
    expect(bus.compareNote()).toContain('Choose a destination airport');
    expect(bus.canCompare()).toBe(false);
  });

  it('says when Flixbus could not be checked', () => {
    bus.load();
    http
      .expectOne((req) => req.url.endsWith('/bus/airport-cities'))
      .flush('down', { status: 502, statusText: 'Bad Gateway' });
    flyFromPorto('MAD');

    expect(bus.compareNote()).toBe("Flixbus couldn't be checked: flights only.");
  });
});
