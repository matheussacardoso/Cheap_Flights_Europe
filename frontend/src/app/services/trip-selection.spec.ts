import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  AIRPORTS,
  ES_ROUTES,
  PT_ROUTES,
  routesFor,
  answerRoutes,
} from '../testing/network-fixtures';
import { TripSelection } from './trip-selection';

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

  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  function chooseOrigin(code = 'OPO'): void {
    trip.selectOrigin(code);
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
  }

  const codes = () => trip.destinations().map((airport) => airport.code);

  it('groups airports into countries sorted by name', () => {
    expect(trip.countries().map((c) => c.code)).toEqual(['IE', 'MA', 'PT', 'ES']);
    expect(trip.countries().find((c) => c.code === 'PT')?.airports.length).toBe(2);
  });

  it("loads the origin country's routes and keeps the origin airport's", () => {
    chooseOrigin('OPO');
    expect(codes()).toEqual(['AGP', 'MAD', 'RAK']);
    expect(trip.reachableCountries().map((c) => c.code)).toEqual(['MA', 'ES']);

    // Same country: no new request.
    trip.selectOrigin('LIS');
    expect(codes()).toEqual(['AGP']);
  });

  it('maps the trip to search parameters', () => {
    chooseOrigin();
    trip.selectDestination('MAD');
    expect(trip.searchSelection()).toEqual({
      origins: ['OPO'],
      destination: 'MAD',
      destinationCountry: null,
    });
    expect(trip.isComplete()).toBe(true);

    trip.selectDestinationCountry('ES');
    expect(trip.searchSelection()).toEqual({
      origins: ['OPO'],
      destination: null,
      destinationCountry: 'ES',
    });
  });

  it('clears the destination when the origin changes or is cleared', () => {
    chooseOrigin();
    trip.selectDestination('MAD');
    trip.selectOrigin('LIS');
    expect(trip.destination()).toBeNull();

    trip.selectDestinationCountry('ES');
    trip.clearOrigin();
    expect(trip.searchSelection()).toEqual({
      origins: [],
      destination: null,
      destinationCountry: null,
    });
    expect(trip.destinations()).toEqual([]);
  });

  it('swaps the trip when the return flight exists', () => {
    chooseOrigin();
    trip.selectDestination('MAD');
    trip.swap();
    http.expectOne(routesFor('ES')).flush(ES_ROUTES);

    expect(trip.origin()).toBe('MAD');
    expect(trip.destination()).toBe('OPO');
  });

  it('drops the destination after a swap when there is no return flight', () => {
    chooseOrigin();
    trip.selectDestination('RAK');
    trip.swap();
    http.expectOne(routesFor('MA')).flush([]);

    expect(trip.origin()).toBe('RAK');
    expect(trip.destination()).toBeNull();
  });

  it('applies a whole route and drops a destination without a direct flight', () => {
    expect(
      trip.applyRoute({ origins: ['LIS'], destination: 'MAD', destinationCountry: null }),
    ).toBe(true);
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    expect(trip.origin()).toBe('LIS');
    expect(trip.destination()).toBeNull(); // LIS has no flight to MAD

    trip.applyRoute({ origins: ['OPO'], destination: null, destinationCountry: 'ES' });
    expect(trip.destinationCountry()).toBe('ES');
  });

  it('refuses a route with unknown airports', () => {
    expect(trip.applyRoute({ origins: ['XXX'], destination: null, destinationCountry: null })).toBe(
      false,
    );
    expect(
      trip.applyRoute({ origins: ['OPO'], destination: 'XXX', destinationCountry: null }),
    ).toBe(false);
    expect(trip.origin()).toBeNull();
  });

  it('reports an error when routes fail to load', () => {
    trip.selectOrigin('OPO');
    http.expectOne(routesFor('PT')).flush('boom', { status: 502, statusText: 'Bad Gateway' });

    expect(trip.error()).toContain('Could not load routes');
    expect(trip.loadingRoutes()).toBe(false);
  });

  it('makes a new request when retrying after a failure', () => {
    trip.selectOrigin('OPO');
    http.expectOne(routesFor('PT')).flush('boom', { status: 502, statusText: 'Bad Gateway' });

    trip.retry();
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    expect(trip.error()).toBe('');
    expect(codes()).toEqual(['AGP', 'MAD', 'RAK']);
  });

  it('ignores routes that arrive after the origin moved to another country', () => {
    trip.selectOrigin('OPO');
    const late = http.expectOne(routesFor('PT'));
    trip.selectOrigin('MAD');
    http.expectOne(routesFor('ES')).flush(ES_ROUTES);
    late.flush(PT_ROUTES);

    expect(codes()).toEqual(['OPO']);
  });

  describe('several departure airports', () => {
    /** Porto to `destination`; then the store loads Spain's routes to find other departures. */
    function fromPortoTo(destination: string): void {
      chooseOrigin('OPO');
      trip.selectDestination(destination);
      TestBed.tick();
      http.expectOne(routesFor('ES')).flush(ES_ROUTES);
    }

    const origins = () => trip.origins();

    it('offers the other airports that fly to the destination, closest first', () => {
      fromPortoTo('AGP');

      // Malaga flies back to Lisbon and Porto: Lisbon is the alternative, ~275 km from Porto.
      const [lisbon] = trip.alternativeOrigins();
      expect(trip.alternativeOrigins().length).toBe(1);
      expect(lisbon.airport.code).toBe('LIS');
      expect(lisbon.km).toBeGreaterThan(270);
      expect(lisbon.km).toBeLessThan(280);
      // Too far to be suggested as nearby (150 km), but it can still be added.
      expect(trip.nearbyOrigins()).toEqual([]);
    });

    it('adds and removes departure airports', () => {
      fromPortoTo('AGP');
      trip.addOrigin('LIS');
      expect(trip.searchSelection()).toEqual({
        origins: ['OPO', 'LIS'],
        destination: 'AGP',
        destinationCountry: null,
      });
      expect(trip.canSwap()).toBe(false);

      // Removing the first departure makes the next one the main departure.
      trip.removeOrigin('OPO');
      expect(origins()).toEqual(['LIS']);
      expect(trip.destination()).toBe('AGP');
    });

    it('only accepts airports that fly to the destination', () => {
      fromPortoTo('AGP');
      trip.addOrigin('DUB');
      expect(origins()).toEqual(['OPO']);
    });

    it('drops extra departures that do not fly to a new destination', () => {
      fromPortoTo('AGP');
      trip.addOrigin('LIS');
      trip.selectDestination('MAD'); // only Porto flies to Madrid
      expect(origins()).toEqual(['OPO']);
    });

    it('needs a destination first, and starts over when the first departure changes', () => {
      chooseOrigin('OPO');
      trip.addOrigin('LIS');
      expect(origins()).toEqual(['OPO']);

      trip.selectDestination('AGP');
      TestBed.tick();
      http.expectOne(routesFor('ES')).flush(ES_ROUTES);
      trip.addOrigin('LIS');
      trip.selectOrigin('LIS');
      expect(origins()).toEqual(['LIS']);
      expect(trip.destination()).toBeNull();
    });

    it('applies a route with several departures', () => {
      trip.applyRoute({ origins: ['OPO', 'LIS'], destination: 'AGP', destinationCountry: null });
      http.expectOne(routesFor('PT')).flush(PT_ROUTES);
      TestBed.tick();
      http.expectOne(routesFor('ES')).flush(ES_ROUTES);

      expect(origins()).toEqual(['OPO', 'LIS']);
    });
  });
});
