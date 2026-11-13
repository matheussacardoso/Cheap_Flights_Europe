import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FlightResponse, FlightService, TripResponse } from '../../services/flight';
import { TripSelection } from '../../services/trip-selection';
import { AIRPORTS } from '../../testing/network-fixtures';
import { TripResultsComponent } from './trip-results';

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

describe('TripResultsComponent', () => {
  async function render(trips: TripResponse[]): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [TripResultsComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(FlightService).tripResults = trips;
    TestBed.inject(TripSelection).airports.set(AIRPORTS);
    const fixture = TestBed.createComponent(TripResultsComponent);
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

  it('explains when nothing was found', async () => {
    const element = await render([]);
    expect(element.querySelector('table')).toBeNull();
    expect(element.textContent).toContain('No round trips found');
  });
});
