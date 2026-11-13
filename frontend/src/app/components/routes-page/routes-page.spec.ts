import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MAP_URL } from '../../services/map-data';
import { TripSelection } from '../../services/trip-selection';
import {
  AIRPORTS,
  ES_ROUTES,
  PT_ROUTES,
  answerRoutes,
  routesFor,
} from '../../testing/network-fixtures';
import { RoutesPageComponent } from './routes-page';

@Component({ template: '' })
class SearchStub {}

describe('RoutesPageComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let element: HTMLElement;
  let trip: TripSelection;

  async function open(url: string): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: RoutesPageComponent },
          { path: 'search', component: SearchStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    trip = TestBed.inject(TripSelection);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, RoutesPageComponent);
    http.expectOne((req) => req.url.endsWith('/network/airports')).flush(AIRPORTS);
    http.expectOne(MAP_URL).flush({ type: 'FeatureCollection', features: [] });
    await harness.fixture.whenStable();
    element = harness.routeNativeElement!;
  }

  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  function destinations(): string[] {
    return [...element.querySelectorAll('.destination .name')].map(
      (el) => el.textContent?.trim() ?? '',
    );
  }

  it('lists the direct flights of the chosen airport and completes the trip from the list', async () => {
    await open('/');
    trip.selectOrigin('OPO');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();

    expect(element.querySelector('#destinations-title')?.textContent).toContain('(3)');
    expect(destinations()).toEqual(['AGP Airport', 'MAD Airport', 'RAK Airport']);

    element.querySelectorAll<HTMLButtonElement>('.destination')[1].click();
    await harness.fixture.whenStable();
    expect(trip.destination()).toBe('MAD');
    expect(element.querySelector('.route-title')?.textContent).toContain('MAD Airport');
    expect(TestBed.inject(Router).url).toBe('/?from=OPO&to=MAD');
  });

  it('opens the search with the chosen route', async () => {
    await open('/');
    trip.selectOrigin('OPO');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    trip.selectDestinationCountry('ES');
    await harness.fixture.whenStable();

    element.querySelector<HTMLAnchorElement>('a.btn-primary')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search?from=OPO&to_country=ES');
  });

  it('restores the trip from the URL', async () => {
    await open('/?from=opo&to=MAD');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();

    expect(trip.searchSelection()).toEqual({
      origins: ['OPO'],
      destination: 'MAD',
      destinationCountry: null,
    });
    expect(element.querySelector('.destination[aria-pressed="true"] .name')?.textContent).toBe(
      'MAD Airport',
    );
  });

  it('keeps several departure airports in the URL', async () => {
    await open('/?from=OPO,LIS&to=AGP');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();
    http.expectOne(routesFor('ES')).flush(ES_ROUTES);
    await harness.fixture.whenStable();

    expect(trip.origins()).toEqual(['OPO', 'LIS']);
    expect(element.querySelector('.route-title')?.textContent).toContain(
      'OPO Airport + LIS Airport',
    );
    expect(TestBed.inject(Router).url).toBe('/?from=OPO,LIS&to=AGP');
  });
});
