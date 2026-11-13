import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TripSelection } from '../../services/trip-selection';
import { AIRPORTS, PT_ROUTES, routesFor } from '../../testing/network-fixtures';
import { FlightSearchComponent } from './flight-search';

@Component({ template: '' })
class ResultsStub {}

describe('FlightSearchComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let component: FlightSearchComponent;
  let element: HTMLElement;

  async function open(url: string): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'search', component: FlightSearchComponent },
          { path: 'search/results', component: ResultsStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl(url, FlightSearchComponent);
    http.expectOne((req) => req.url.endsWith('/network/airports')).flush(AIRPORTS);
    await harness.fixture.whenStable();
    element = harness.routeNativeElement!;
  }

  afterEach(() => http.verify());

  it('asks for the trip and the date when submitting an empty form', async () => {
    await open('/search');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();

    expect(element.textContent).toContain('Choose where you fly from and to.');
    expect(element.querySelector('#date_from-error')?.textContent).toContain('departure date');
    expect(element.querySelector('#date_from')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('fills the trip from the URL and searches it', async () => {
    await open('/search?from=OPO&to_country=ES');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();

    const boxes = [...element.querySelectorAll<HTMLInputElement>('[role="combobox"]')];
    expect(boxes.map((box) => box.value)).toEqual(['OPO Airport', 'Any airport in Spain']);

    component.searchForm.patchValue({ date_from: '2026-12-04' });
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    const search = http.expectOne((req) => req.url.endsWith('/flights/cheapest'));
    expect(search.request.params.get('origin')).toBe('OPO');
    expect(search.request.params.get('destination_country')).toBe('ES');
    expect(search.request.params.has('destination')).toBe(false);
    search.flush([]);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/search/results');
  });

  it('saves the chosen trip and lists it under saved routes', async () => {
    await open('/search');
    TestBed.inject(TripSelection).applyRoute({
      origin: 'OPO',
      destination: 'MAD',
      destinationCountry: null,
    });
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();

    const save = element.querySelector<HTMLButtonElement>('.save-route')!;
    expect(save.textContent).toContain('Save route');
    save.click();
    await harness.fixture.whenStable();

    expect(save.textContent).toContain('Saved route');
    expect(element.querySelector('.route-button')?.getAttribute('aria-label')).toBe(
      'OPO Airport to MAD Airport',
    );
  });
});
