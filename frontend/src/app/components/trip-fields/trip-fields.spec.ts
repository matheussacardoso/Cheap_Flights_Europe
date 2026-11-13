import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Airport } from '../../services/network';
import { TripSelection } from '../../services/trip-selection';
import {
  AIRPORTS,
  ES_ROUTES,
  PT_ROUTES,
  airport,
  answerRoutes,
  routesFor,
} from '../../testing/network-fixtures';
import { TripFieldsComponent } from './trip-fields';

/** Braga: 44 km from Porto, so it is suggested as a nearby departure. */
const BRAGA: Airport = airport('BGZ', 'PT', 'Portugal', [41.58, -8.42]);

describe('TripFieldsComponent: extra departure airports', () => {
  let fixture: ComponentFixture<TripFieldsComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let trip: TripSelection;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TripFieldsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    trip = TestBed.inject(TripSelection);
    trip.airports.set([...AIRPORTS, BRAGA]);
    fixture = TestBed.createComponent(TripFieldsComponent);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  /** Porto to Malaga; Malaga flies back to Lisbon, Porto and Braga. */
  async function portoToMalaga(): Promise<void> {
    trip.selectOrigin('OPO');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    trip.selectDestination('AGP');
    await fixture.whenStable();
    http
      .expectOne(routesFor('ES'))
      .flush([...ES_ROUTES, { origin: 'AGP', destination: 'BGZ', seasonal: false }]);
    await fixture.whenStable();
  }

  const section = () => element.querySelector('.extra-origins');
  const suggestions = () =>
    [...element.querySelectorAll<HTMLButtonElement>('.suggestion')].map((b) =>
      b.textContent?.replace(/\s+/g, ' ').trim(),
    );

  it('appears only once From and To are chosen', async () => {
    expect(section()).toBeNull();
    await portoToMalaga();
    expect(section()?.textContent).toContain('Also fly from');
  });

  it('suggests nearby airports that fly to the destination, and adds one with a click', async () => {
    await portoToMalaga();
    expect(suggestions()).toEqual(['+ BGZ Airport 44 km']);

    element.querySelector<HTMLButtonElement>('.suggestion')!.click();
    await fixture.whenStable();

    expect(trip.origins()).toEqual(['OPO', 'BGZ']);
    expect(element.querySelector('.chip')?.textContent).toContain('BGZ Airport');
  });

  it('adds a farther airport from the box, and removes it from its chip', async () => {
    await portoToMalaga();
    const box = element.querySelector<HTMLInputElement>('.add-origin input')!;
    box.dispatchEvent(new Event('focus'));
    box.value = 'lis';
    box.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const option = element.querySelector<HTMLElement>('.add-origin [role="option"]')!;
    expect(option.textContent).toContain('km away');
    option.click();
    await fixture.whenStable();
    expect(trip.origins()).toEqual(['OPO', 'LIS']);

    element.querySelector<HTMLButtonElement>('[aria-label="Remove LIS Airport"]')!.click();
    await fixture.whenStable();
    expect(trip.origins()).toEqual(['OPO']);
  });

  it('stops offering more after three departure airports', async () => {
    await portoToMalaga();
    trip.addOrigin('BGZ');
    trip.addOrigin('LIS');
    await fixture.whenStable();

    expect(element.querySelector('.add-origin')).toBeNull();
    expect(section()?.textContent).toContain('up to 3 airports');
  });
});
