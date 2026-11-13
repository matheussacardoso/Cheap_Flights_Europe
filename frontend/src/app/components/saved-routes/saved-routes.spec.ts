import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SAVED_ROUTES_KEY, SavedRoute } from '../../services/saved-routes';
import { TripSelection } from '../../services/trip-selection';
import { AIRPORTS, PT_ROUTES, answerRoutes } from '../../testing/network-fixtures';
import { SavedRoutesComponent } from './saved-routes';

const ROUTES: SavedRoute[] = [
  {
    id: 'OPO-MAD',
    originCountry: 'PT',
    origins: ['OPO'],
    originName: 'OPO Airport',
    destinationCountry: 'ES',
    destination: 'MAD',
    destinationName: 'MAD Airport',
  },
  {
    id: 'LIS-any-ES',
    originCountry: 'PT',
    origins: ['LIS'],
    originName: 'LIS Airport',
    destinationCountry: 'ES',
    destination: null,
    destinationName: 'Any airport in Spain',
  },
];

describe('SavedRoutesComponent', () => {
  let fixture: ComponentFixture<SavedRoutesComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let trip: TripSelection;

  async function render(routes: SavedRoute[]): Promise<void> {
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
    await TestBed.configureTestingModule({
      imports: [SavedRoutesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    trip = TestBed.inject(TripSelection);
    trip.airports.set(AIRPORTS);
    fixture = TestBed.createComponent(SavedRoutesComponent);
    element = fixture.nativeElement;
    await fixture.whenStable();
  }

  function routeButtons(): HTMLButtonElement[] {
    return [...element.querySelectorAll<HTMLButtonElement>('.route-button')];
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  it('renders nothing visible without saved routes', async () => {
    await render([]);
    expect(element.querySelector('.saved-routes')).toBeNull();
  });

  it('lists saved routes by name', async () => {
    await render(ROUTES);
    expect(routeButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'OPO Airport to MAD Airport',
      'LIS Airport to Any airport in Spain',
    ]);
    expect(routeButtons()[1].textContent).toContain('Any airport in Spain');
  });

  it('fills the trip when a route is clicked and marks it as current', async () => {
    await render(ROUTES);
    routeButtons()[1].click();
    http.expectOne((req) => req.url.endsWith('/network/routes')).flush(PT_ROUTES);
    await fixture.whenStable();

    expect(trip.searchSelection()).toEqual({
      origins: ['LIS'],
      destination: null,
      destinationCountry: 'ES',
    });
    expect(routeButtons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(element.querySelector('[aria-live]')?.textContent).toBe(
      'LIS Airport to Any airport in Spain selected.',
    );
  });

  it('removes a route', async () => {
    await render(ROUTES);
    element
      .querySelector<HTMLButtonElement>('[aria-label="Remove OPO Airport to MAD Airport"]')!
      .click();
    await fixture.whenStable();

    expect(routeButtons().length).toBe(1);
    expect(JSON.parse(localStorage.getItem(SAVED_ROUTES_KEY)!)).toEqual([ROUTES[1]]);
  });
});
