import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ViewportScroller } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SearchResults } from '../../services/search-results';
import { TODAY } from '../../services/trip-period';
import { TripSelection } from '../../services/trip-selection';
import { AIRPORTS, PT_ROUTES, routesFor, answerRoutes } from '../../testing/network-fixtures';
import { answerBusNetwork } from '../../testing/bus-fixtures';
import { SearchPage } from './search-page';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonToggleHarness } from '@angular/material/button-toggle/testing';
import { MatSelectHarness } from '@angular/material/select/testing';

@Component({ template: '' })
class ResultsStub {}

describe('SearchPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let element: HTMLElement;
  let scrollToPosition: ReturnType<typeof vi.fn>;

  async function open(url: string): Promise<void> {
    localStorage.clear();
    scrollToPosition = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'search', component: SearchPage },
          { path: 'search/results', component: ResultsStub },
          { path: 'search/trips', component: ResultsStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // A Friday: the next Thursday is 19 Nov.
        { provide: TODAY, useValue: () => new Date(2026, 10, 13) },
        // jsdom doesn't implement scrolling.
        { provide: ViewportScroller, useValue: { scrollToPosition } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, SearchPage);
    http.expectOne((req) => req.url.endsWith('/network/airports')).flush(AIRPORTS);
    await harness.fixture.whenStable();
    element = harness.routeNativeElement!;
  }

  afterEach(() => {
    answerRoutes(http);
    // Twice: the bus routes are asked for once the airport ↔ city links arrive.
    answerBusNetwork(http);
    answerBusNetwork(http);
    http.verify();
  });

  function loader() {
    return TestbedHarnessEnvironment.loader(harness.fixture);
  }

  function select(id: string): Promise<MatSelectHarness> {
    return loader().getHarness(MatSelectHarness.with({ selector: `#${id}` }));
  }

  /** The options of a select, as their visible text. */
  async function options(id: string): Promise<string[]> {
    const field = await select(id);
    await field.open();
    const texts = await Promise.all((await field.getOptions()).map((o) => o.getText()));
    await field.close();
    return texts.map((text) => text.replace(/\s+/g, ' ').trim());
  }

  /** What a select shows as chosen. */
  async function chosen(id: string): Promise<string> {
    return (await (await select(id)).getValueText()).replace(/\s+/g, ' ').trim();
  }

  /** Picks the option with this text, as the user would. */
  async function pick(id: string, text: string): Promise<void> {
    const field = await select(id);
    await field.open();
    await field.clickOptions({ text });
  }

  /** Types into a text or date field, as the user would. */
  async function type(id: string, value: string): Promise<void> {
    const field = element.querySelector<HTMLInputElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
  }

  async function toggle(text: string): Promise<void> {
    await (await loader().getHarness(MatButtonToggleHarness.with({ text }))).check();
  }

  async function chooseOneWay(): Promise<void> {
    await toggle('One way');
  }

  it('asks for the trip and the date when submitting an empty one-way search', async () => {
    await open('/search');
    await chooseOneWay();
    await type('date_from', '');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();

    expect(element.textContent).toContain('Choose where you fly from and to.');
    expect(element.querySelector('#date_from-error')?.textContent).toContain('departure date');
    expect(element.querySelector('#date_from')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('fills the trip from the URL and searches one-way flights', async () => {
    await open('/search?from=OPO&to_country=ES');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();

    const boxes = [...element.querySelectorAll<HTMLInputElement>('input[role="combobox"]')];
    expect(boxes.map((box) => box.value)).toEqual(['OPO Airport', 'Any airport in Spain']);

    await chooseOneWay();
    await type('date_from', '2026-12-04');
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    const search = http.expectOne((req) => req.url.endsWith('/flights/cheapest'));
    expect(search.request.params.get('origin')).toBe('OPO');
    expect(search.request.params.get('destination_country')).toBe('ES');
    expect(search.request.params.has('destination')).toBe(false);
    search.flush([]);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/search/results');
    expect(scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });

  it('only offers trips on the chosen days, starting from the next one', async () => {
    await open('/search');

    // Thursday to Monday by default: the next 8 weeks after the first trip are preselected.
    expect(await chosen('date_from')).toBe('Thu 19 Nov → Mon 23 Nov 2026');
    expect(await chosen('date_to')).toBe('Thu 14 Jan → Mon 18 Jan 2027');
    const first = await options('date_from');
    expect(first[0]).toBe('Thu 19 Nov → Mon 23 Nov 2026');
    expect(first.every((text) => text.startsWith('Thu'))).toBe(true);
    expect(first.length).toBe(52);

    // The last trip is the same weekday, at most 92 days after the first: 14 choices.
    const last = await options('date_to');
    expect(last[0]).toBe('Thu 19 Nov → Mon 23 Nov 2026');
    expect(last.at(-1)).toBe('Thu 18 Feb → Mon 22 Feb 2027');
    expect(element.querySelector('#period-summary')?.textContent).toContain(
      '4 nights · 9 departures to compare',
    );
  });

  it('moves both dates to the new days when the days change', async () => {
    await open('/search');
    await toggle('Fri → Tue');

    // Both dates move to the Friday of the same week; the period keeps its 8 weeks.
    expect(await chosen('date_from')).toBe('Fri 20 Nov → Tue 24 Nov 2026');
    expect(await chosen('date_to')).toBe('Fri 15 Jan → Tue 19 Jan 2027');
    // Today is a Friday, so it is the first choice.
    expect((await options('date_from'))[0]).toBe('Fri 13 Nov → Tue 17 Nov 2026');

    // A first trip after the last one pulls the last one along, 8 weeks later.
    await pick('date_from', 'Fri 22 Jan → Tue 26 Jan 2027');
    expect(await chosen('date_to')).toBe('Fri 19 Mar → Tue 23 Mar 2027');
  });

  it('searches round trips and shows what is running while it waits', async () => {
    await open('/search?from=OPO&to=MAD');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();

    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    const search = http.expectOne((req) => req.url.endsWith('/flights/trips'));
    expect(search.request.params.get('depart_day')).toBe('thursday');
    expect(search.request.params.get('return_day')).toBe('monday');
    expect(search.request.params.get('destination')).toBe('MAD');
    expect(search.request.params.get('date_from')).toBe('2026-11-19');
    expect(search.request.params.get('date_to')).toBe('2027-01-14');

    const status = element.querySelector('app-loading-indicator [role="status"]');
    expect(status?.textContent).toContain('Finding the cheapest dates');
    expect(status?.textContent).toContain(
      'Comparing 9 Thursday → Monday trips from OPO Airport to MAD Airport',
    );
    expect(element.querySelector('form')?.hasAttribute('inert')).toBe(true);

    search.flush([]);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/search/trips');
    expect(TestBed.inject(SearchResults).trips()).toEqual([]);
  });

  it('saves the chosen trip and lists it under saved routes', async () => {
    await open('/search');
    TestBed.inject(TripSelection).applyRoute({
      origins: ['OPO'],
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

  it('searches from every departure airport', async () => {
    await open('/search?from=OPO,LIS&to=AGP');
    http.expectOne(routesFor('PT')).flush(PT_ROUTES);
    await harness.fixture.whenStable();
    answerRoutes(http);
    await harness.fixture.whenStable();

    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await harness.fixture.whenStable();
    const search = http.expectOne((req) => req.url.endsWith('/flights/trips'));
    expect(search.request.params.getAll('origin')).toEqual(['OPO', 'LIS']);
    expect(element.querySelector('app-loading-indicator')?.textContent).toContain(
      'from OPO Airport, LIS Airport to AGP Airport',
    );
    search.flush([]);
  });
});
