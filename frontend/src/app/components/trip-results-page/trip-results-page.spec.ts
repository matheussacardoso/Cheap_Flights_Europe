import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FlightResponse, TripResponse } from '../../services/flight-http-client';
import { SearchResults } from '../../services/search-results';
import { TripSelection } from '../../services/trip-selection';
import { AIRPORTS } from '../../testing/network-fixtures';
import { TripResultsPage } from './trip-results-page';

function flight(origin: string, destination: string, time: string, price: number): FlightResponse {
  return {
    flightNumber: 'FR 1234',
    origin,
    destination,
    departureTime: time,
    price,
    currency: 'EUR',
  };
}

const TRIPS: TripResponse[] = [
  {
    totalPrice: 59.98,
    outbound: flight('OPO', 'MAD', '2026-12-10T10:00:00', 29.99),
    inbound: flight('MAD', 'OPO', '2026-12-14T18:30:00', 29.99),
  },
  {
    totalPrice: 120,
    outbound: flight('OPO', 'MAD', '2026-12-03T10:00:00', 60),
    inbound: flight('MAD', 'OPO', '2026-12-07T18:30:00', 60),
  },
];

describe('TripResultsPage', () => {
  async function render(trips: TripResponse[]): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [TripResultsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(SearchResults).setTrips(trips);
    TestBed.inject(TripSelection).airports.set(AIRPORTS);
    const fixture = TestBed.createComponent(TripResultsPage);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('lists each trip with its dates and marks the cheapest', async () => {
    const element = await render(TRIPS);
    const rows = element.querySelectorAll('tbody tr');

    expect(rows.length).toBe(2);
    expect(rows[0].classList).toContain('is-cheapest');
    expect(rows[0].textContent).toContain('Thu 10 Dec');
    expect(rows[0].textContent).toContain('Mon 14 Dec');
    expect(rows[0].textContent).toContain('MAD Airport (MAD)');
    expect(rows[0].textContent).toContain('€59.98');
    expect(rows[0].textContent).toContain('Cheapest');
    expect(rows[1].textContent).not.toContain('Cheapest');
  });

  describe('with buses', () => {
    function ride(departure: string, arrival: string, price: number, via: string[] = []) {
      return {
        origin: 'city-porto',
        destination: 'city-madrid',
        departureTime: departure,
        arrivalTime: arrival,
        price,
        currency: 'EUR',
        transfers: via.length,
        via,
      };
    }

    async function renderCompared(): Promise<HTMLElement> {
      TestBed.configureTestingModule({
        imports: [TripResultsPage],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
      const trip = TestBed.inject(TripSelection);
      trip.airports.set(AIRPORTS);
      trip.origins.set(['OPO']);
      trip.destination.set('MAD');
      const results = TestBed.inject(SearchResults);
      results.setTrips(TRIPS);
      // 10 Dec: the plane (€59.98) wins; 3 Dec: the bus (€50) wins; 17 Dec: only a bus.
      results.setBusTrips([
        {
          totalPrice: 80,
          outbound: ride('2026-12-10T08:00:00+00:00', '2026-12-10T17:00:00+01:00', 40, [
            'Salamanca',
          ]),
          inbound: ride('2026-12-14T08:00:00+01:00', '2026-12-14T16:00:00+00:00', 40),
        },
        {
          totalPrice: 50,
          outbound: ride('2026-12-03T08:00:00+00:00', '2026-12-03T17:00:00+01:00', 25),
          inbound: ride('2026-12-07T08:00:00+01:00', '2026-12-07T16:00:00+00:00', 25),
        },
        {
          totalPrice: 70,
          outbound: ride('2026-12-17T08:00:00+00:00', '2026-12-17T17:00:00+01:00', 35),
          inbound: ride('2026-12-21T08:00:00+01:00', '2026-12-21T16:00:00+00:00', 35),
        },
      ]);
      const fixture = TestBed.createComponent(TripResultsPage);
      await fixture.whenStable();
      return fixture.nativeElement;
    }

    it('puts plane and bus side by side, week by week, and says which is cheaper', async () => {
      const element = await renderCompared();
      // Spaces normalised, as the browser shows them.
      const rows = [...element.querySelectorAll('tbody tr')].map((row) =>
        (row.textContent ?? '').replace(/\s+/g, ' '),
      );

      expect(element.querySelector('h1')?.textContent).toBe('Plane or bus?');
      expect(element.querySelector('.summary-text')?.textContent).toBe(
        'Ryanair is cheaper in 1 week, Flixbus in 1 week.',
      );
      // Cheapest first: the 3 Dec bus (€50), then 10 Dec (plane €59.98), then the 17 Dec bus.
      expect(rows[0]).toContain('Thu 3 Dec');
      expect(rows[0]).toContain('Bus cheaper by €70.00');
      expect(rows[0]).toContain('Cheapest');
      expect(rows[1]).toContain('Plane cheaper by €20.02');
      expect(rows[1]).toContain('1 change · via Salamanca');
      // Bus times stay local; 08:00 in Porto to 17:00 in Madrid is 8 hours.
      expect(rows[1]).toContain('08:00 → 17:00 · 8h by bus');
      expect(rows[2]).toContain('No flight');
      expect(rows[2]).toContain('Only by bus');
    });
  });

  it('says why buses were not compared', async () => {
    TestBed.configureTestingModule({
      imports: [TripResultsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(SearchResults).setTrips(TRIPS);
    TestBed.inject(SearchResults).setBusTrips([], "Flixbus doesn't go to Palma: flights only.");
    const fixture = TestBed.createComponent(TripResultsPage);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.bus-note')?.textContent).toContain(
      "Flixbus doesn't go to Palma",
    );
    expect(element.querySelector('thead')?.textContent).not.toContain('Flixbus');
  });

  it('explains when nothing was found', async () => {
    const element = await render([]);
    expect(element.querySelector('table')).toBeNull();
    expect(element.textContent).toContain('No round trips found');
  });
});
