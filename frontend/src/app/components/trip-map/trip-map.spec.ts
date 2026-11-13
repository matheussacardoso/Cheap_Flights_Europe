import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { CountryShapeProperties, MAP_URL } from '../../services/map-data';
import { TripSelection } from '../../services/trip-selection';
import { AIRPORTS, PT_ROUTES, routesFor, answerRoutes } from '../../testing/network-fixtures';
import { TripMapComponent } from './trip-map';

/** A rough box around a country; rings run clockwise, as d3-geo expects. */
function country(code: string, west: number, south: number, east: number, north: number) {
  return {
    type: 'Feature' as const,
    properties: { code, label: [(west + east) / 2, (south + north) / 2] as [number, number] },
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: [
        [
          [
            [west, south],
            [west, north],
            [east, north],
            [east, south],
            [west, south],
          ],
        ],
      ],
    },
  };
}

/** Ryanair countries from the fixtures plus France, which they don't serve. */
const SHAPES: FeatureCollection<MultiPolygon, CountryShapeProperties> = {
  type: 'FeatureCollection',
  features: [
    country('PT', -9.5, 37, -6.2, 42),
    country('ES', -9, 36, 3.3, 43.8),
    country('MA', -13, 27.7, -1, 35.9),
    country('IE', -10.5, 51.4, -6, 55.4),
    country('FR', -4.8, 42.3, 8.2, 51.1),
  ],
};

describe('TripMapComponent', () => {
  let fixture: ComponentFixture<TripMapComponent>;
  let http: HttpTestingController;
  let trip: TripSelection;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TripMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    trip = TestBed.inject(TripSelection);
    trip.airports.set(AIRPORTS);

    fixture = TestBed.createComponent(TripMapComponent);
    element = fixture.nativeElement;
    await fixture.whenStable();
    http.expectOne(MAP_URL).flush(SHAPES);
    await fixture.whenStable();
  });

  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  /** The aria-labels of the airports the user can click, in Tab order. */
  function choices(): string[] {
    return [...element.querySelectorAll('[role="button"]')].map(
      (el) => el.getAttribute('aria-label') ?? '',
    );
  }

  function dot(code: string): Element {
    const found = [...element.querySelectorAll('.airport')].find((el) =>
      el.querySelector('title')?.textContent?.includes(`(${code})`),
    );
    if (!found) {
      throw new Error(`No airport ${code}`);
    }
    return found;
  }

  async function flyFromPorto(): Promise<void> {
    trip.origins.set(['OPO']);
    trip.routesByCountry.set({ PT: PT_ROUTES });
    await fixture.whenStable();
  }

  /** Whether the airport's dot is inside the visible part of the map. */
  function inView(code: string): boolean {
    const map = fixture.componentInstance;
    const airport = map.airports().find((a) => a.code === code)!;
    const [x, y] = map.transform().apply([airport.x, airport.y]);
    const { width, height } = map.size();
    return x >= 0 && x <= width && y >= 0 && y <= height;
  }

  it('shows every Ryanair airport as a clickable dot before a departure is chosen', () => {
    expect(choices().length).toBe(AIRPORTS.length);
    expect(element.querySelectorAll('.country.is-served').length).toBe(4);
    expect(element.querySelectorAll('.country.is-outside').length).toBe(1);
  });

  it('flies from the airport clicked, with the mouse or the keyboard', async () => {
    dot('OPO').dispatchEvent(new MouseEvent('click'));
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await fixture.whenStable();
    expect(trip.origin()).toBe('OPO');

    dot('MAD').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(trip.destination()).toBe('MAD');
  });

  it("draws the departure airport's direct flights; other airports can't be chosen", async () => {
    await flyFromPorto();

    expect(element.querySelectorAll('.flight').length).toBe(3);
    expect(choices()).toEqual([
      'AGP Airport, AGP City (AGP)',
      'MAD Airport, MAD City (MAD)',
      'RAK Airport, RAK City (RAK)',
    ]);
    expect(dot('DUB').getAttribute('role')).toBeNull();
    expect(dot('DUB').querySelector('title')?.textContent).toContain('No direct flight from');
  });

  it('highlights the chosen flight with an arrow', async () => {
    await flyFromPorto();
    trip.selectDestination('MAD');
    await fixture.whenStable();

    const chosen = element.querySelectorAll('.flight.is-chosen');
    expect(chosen.length).toBe(1);
    expect(chosen[0].getAttribute('marker-end')).toContain('trip-map-arrow');
    expect(element.querySelector('.flights')?.classList).toContain('has-chosen');
  });

  it('highlights the country and its flights for "any airport"', async () => {
    await flyFromPorto();
    trip.selectDestinationCountry('ES');
    await fixture.whenStable();

    expect(element.querySelectorAll('.flight.is-chosen').length).toBe(2);
    expect(element.querySelectorAll('.country.is-destination').length).toBe(1);
  });

  it('zooms to the departure airport and its destinations', async () => {
    expect(fixture.componentInstance.zoom()).toBe(1);
    await flyFromPorto();
    trip.selectDestination('MAD');
    await fixture.whenStable();

    expect(fixture.componentInstance.zoom()).toBeGreaterThan(1);
    expect(inView('OPO') && inView('MAD')).toBe(true);
  });

  it('zooms with the buttons and resets the view', async () => {
    const button = (label: string) =>
      element.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
    expect(button('Zoom out').disabled).toBe(true);

    button('Zoom in').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.zoom()).toBeCloseTo(1.5);
    expect(button('Zoom out').disabled).toBe(false);

    button('Reset view').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.zoom()).toBe(1);
  });

  it('names the airports of the trip, not their codes', async () => {
    await flyFromPorto();
    const names = [...element.querySelectorAll('.airport-name')].map((t) => t.textContent?.trim());
    expect(names).toContain('OPO Airport');
    expect(names).toContain('MAD Airport');
    expect(names).not.toContain('DUB Airport');
  });
});

describe('TripMapComponent when the map fails to load', () => {
  it('shows an error and retries', async () => {
    await TestBed.configureTestingModule({
      imports: [TripMapComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TripMapComponent);
    await fixture.whenStable();

    http.expectOne(MAP_URL).flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Could not load the map',
    );

    element.querySelector<HTMLButtonElement>('.status button')?.click();
    http.expectOne(MAP_URL).flush(SHAPES);
    await fixture.whenStable();
    expect(element.querySelector('svg')).not.toBeNull();
    http.verify();
  });
});
