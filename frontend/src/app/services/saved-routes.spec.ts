import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AIRPORTS, PT_ROUTES, answerRoutes } from '../testing/network-fixtures';
import { SAVED_ROUTES_KEY, SAVED_ROUTES_KEY_V1, SavedRoute, SavedRoutes } from './saved-routes';
import { TripSelection } from './trip-selection';

const OPO_TO_MAD: SavedRoute = {
  id: 'OPO-MAD',
  originCountry: 'PT',
  origins: ['OPO'],
  originName: 'OPO Airport',
  destinationCountry: 'ES',
  destination: 'MAD',
  destinationName: 'MAD Airport',
};

describe('SavedRoutes', () => {
  let http: HttpTestingController;
  let trip: TripSelection;

  function setUp(): SavedRoutes {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    trip = TestBed.inject(TripSelection);
    trip.airports.set(AIRPORTS);
    return TestBed.inject(SavedRoutes);
  }

  /** OPO to an airport, or to any airport in Spain. */
  function chooseTrip(destination: string | null): void {
    trip.selectOrigin('OPO');
    http.expectOne((req) => req.url.endsWith('/network/routes')).flush(PT_ROUTES);
    if (destination) {
      trip.selectDestination(destination);
    } else {
      trip.selectDestinationCountry('ES');
    }
  }

  function stored(): unknown {
    return JSON.parse(localStorage.getItem(SAVED_ROUTES_KEY) ?? 'null');
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  it('has nothing to save until the trip is complete', () => {
    const saved = setUp();
    expect(saved.current()).toBeNull();
    saved.toggleCurrent();
    expect(saved.routes()).toEqual([]);
  });

  it('saves the current trip to localStorage, and removes it on a second toggle', () => {
    const saved = setUp();
    chooseTrip('MAD');

    saved.toggleCurrent();
    expect(saved.isCurrentSaved()).toBe(true);
    expect(stored()).toEqual([OPO_TO_MAD]);

    saved.toggleCurrent();
    expect(saved.isCurrentSaved()).toBe(false);
    expect(stored()).toEqual([]);
  });

  it('names "any airport" routes after the destination country', () => {
    const saved = setUp();
    chooseTrip(null);

    expect(saved.current()).toEqual(
      expect.objectContaining({
        id: 'OPO-any-ES',
        destination: null,
        destinationName: 'Any airport in Spain',
      }),
    );
  });

  it('loads saved routes and skips invalid entries', () => {
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify([OPO_TO_MAD, { id: 'broken' }, 42]));
    expect(setUp().routes()).toEqual([OPO_TO_MAD]);
  });

  it('starts empty when the stored value is not JSON', () => {
    localStorage.setItem(SAVED_ROUTES_KEY, '{not json');
    expect(setUp().routes()).toEqual([]);
  });

  it('makes a saved route the current trip', () => {
    const saved = setUp();

    expect(saved.use(OPO_TO_MAD)).toBe(true);
    http.expectOne((req) => req.url.endsWith('/network/routes')).flush(PT_ROUTES);

    expect(trip.searchSelection()).toEqual({
      origins: ['OPO'],
      destination: 'MAD',
      destinationCountry: null,
    });
    expect(saved.isCurrentSaved()).toBe(false); // it was never saved in this test
    expect(trip.destinationCodes().has('MAD')).toBe(true);
  });

  it('refuses a route whose airport is no longer served', () => {
    const saved = setUp();
    expect(saved.use({ ...OPO_TO_MAD, destination: 'XXX' })).toBe(false);
    expect(trip.origin()).toBeNull();
  });

  it('brings routes saved before several departures over to the new format', () => {
    const { origins, ...v1 } = OPO_TO_MAD;
    localStorage.setItem(SAVED_ROUTES_KEY_V1, JSON.stringify([{ ...v1, origin: origins[0] }]));

    expect(setUp().routes()).toEqual([OPO_TO_MAD]);
    expect(JSON.parse(localStorage.getItem(SAVED_ROUTES_KEY)!)).toEqual([OPO_TO_MAD]);
  });

  it('saves several departure airports as one route', () => {
    const saved = setUp();
    trip.applyRoute({ origins: ['OPO', 'LIS'], destination: 'AGP', destinationCountry: null });
    http.expectOne((req) => req.url.endsWith('/network/routes')).flush(PT_ROUTES);

    expect(saved.current()).toEqual(
      expect.objectContaining({
        id: 'OPO+LIS-AGP',
        origins: ['OPO', 'LIS'],
        originName: 'OPO Airport + LIS Airport',
      }),
    );
  });
});
