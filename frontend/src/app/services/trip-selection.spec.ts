import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AIRPORTS, PT_ROUTES } from '../testing/network-fixtures';
import { ANY_AIRPORT, TripSelection } from './trip-selection';

describe('TripSelection', () => {
  let trip: TripSelection;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    trip = TestBed.inject(TripSelection);
    http = TestBed.inject(HttpTestingController);

    trip.loadAirports();
    http.expectOne((req) => req.url.endsWith('/network/airports')).flush(AIRPORTS);
  });

  afterEach(() => http.verify());

  function chooseOrigin(): void {
    trip.selectOriginCountry('PT');
    http
      .expectOne(
        (req) => req.url.endsWith('/network/routes') && req.params.get('origin_country') === 'PT',
      )
      .flush(PT_ROUTES);
  }

  it('groups airports into countries sorted by name', () => {
    expect(trip.countries().map((c) => c.code)).toEqual(['IE', 'MA', 'PT', 'ES']);
    expect(trip.countries().find((c) => c.code === 'PT')?.airports.length).toBe(2);
  });

  it('finds the countries reachable from the origin country', () => {
    chooseOrigin();
    expect([...trip.reachableCountries()].sort()).toEqual(['ES', 'MA']);
  });

  it('enables only origin airports that serve the destination country', () => {
    chooseOrigin();
    trip.selectDestinationCountry('MA');
    expect([...trip.originAirportsServingDestination()]).toEqual(['OPO']);
  });

  it('finds destination airports reachable from the origin airport', () => {
    chooseOrigin();
    trip.selectDestinationCountry('ES');
    trip.selectOriginAirport('LIS');
    expect([...trip.reachableDestinationAirports()]).toEqual(['AGP']);
    trip.selectOriginAirport('OPO');
    expect([...trip.reachableDestinationAirports()].sort()).toEqual(['AGP', 'MAD']);
  });

  it('maps "any airport" to a destination country search', () => {
    chooseOrigin();
    trip.selectDestinationCountry('ES');
    trip.selectOriginAirport('OPO');
    trip.selectDestinationAirport(ANY_AIRPORT);
    expect(trip.searchSelection()).toEqual({
      origin: 'OPO',
      destination: null,
      destinationCountry: 'ES',
    });

    trip.selectDestinationAirport('MAD');
    expect(trip.searchSelection()).toEqual({
      origin: 'OPO',
      destination: 'MAD',
      destinationCountry: null,
    });
  });

  it('clears later steps when an earlier step changes', () => {
    chooseOrigin();
    trip.selectDestinationCountry('ES');
    trip.selectOriginAirport('OPO');
    trip.selectDestinationAirport('MAD');

    trip.selectDestinationCountry('MA');

    expect(trip.originAirport()).toBeNull();
    expect(trip.destinationAirport()).toBeNull();
    expect(trip.originCountry()).toBe('PT');
  });

  it('reports an error when routes fail to load', () => {
    trip.selectOriginCountry('PT');
    http
      .expectOne((req) => req.url.endsWith('/network/routes'))
      .flush('down', { status: 502, statusText: 'Bad Gateway' });
    expect(trip.error()).toContain('Could not load routes');
    expect(trip.loadingRoutes()).toBe(false);
  });
});
