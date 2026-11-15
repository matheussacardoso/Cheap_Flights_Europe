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

  function fileButtons(): string[] {
    return [...element.querySelectorAll<HTMLButtonElement>('.file-actions button')].map((button) =>
      button.textContent!.replace(/[↓↑]/, '').trim(),
    );
  }

  /** Picks a file in the hidden file input, as the browser's file dialog would. */
  async function upload(file: File): Promise<void> {
    const input = element.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const status = () => element.querySelector('.file-status');
  const announced = () => element.querySelector('[aria-live]')?.textContent;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    answerRoutes(http);
    http.verify();
  });

  it('explains how to add routes, and offers only the upload, without saved routes', async () => {
    await render([]);
    expect(element.querySelector('.hint')?.textContent).toContain('upload a routes file');
    expect(fileButtons()).toEqual(['Upload file']);
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

  describe('routes file', () => {
    afterEach(() => vi.restoreAllMocks());

    it('downloads the saved routes as a JSON file', async () => {
      await render(ROUTES);
      let blob: Blob | undefined;
      URL.createObjectURL = vi.fn((value: Blob) => {
        blob = value;
        return 'blob:routes';
      });
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        expect(this.download).toBe('cheap-flights-routes.json');
        expect(this.href).toBe('blob:routes');
      });

      element.querySelector<HTMLButtonElement>('.file-actions button')!.click();
      await fixture.whenStable();

      expect(click).toHaveBeenCalledOnce();
      expect(blob!.type).toBe('application/json');
      expect(JSON.parse(await blob!.text()).routes).toEqual([
        { origins: ['OPO'], destination: 'MAD', destinationCountry: 'ES' },
        { origins: ['LIS'], destination: null, destinationCountry: 'ES' },
      ]);
      expect(announced()).toBe('2 routes downloaded as cheap-flights-routes.json.');
    });

    it('opens the file dialog from the Upload button', async () => {
      await render([]);
      const input = element.querySelector<HTMLInputElement>('input[type="file"]')!;
      const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
      element.querySelector<HTMLButtonElement>('.file-actions button')!.click();
      expect(click).toHaveBeenCalledOnce();
      expect(input.accept).toBe('.json,application/json');
    });

    it('adds the routes of an uploaded file and lists them', async () => {
      await render([ROUTES[0]]);
      const file = {
        version: 1,
        routes: [
          { origins: ['OPO'], destination: 'MAD', destinationCountry: 'ES' },
          { origins: ['LIS'], destination: null, destinationCountry: 'ES' },
          { origins: ['XXX'], destination: 'MAD', destinationCountry: 'ES' },
        ],
      };
      await upload(new File([JSON.stringify(file)], 'routes.json'));

      expect(routeButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
        'OPO Airport to MAD Airport',
        'LIS Airport to Any airport in Spain',
      ]);
      const text =
        'Added 1 route. 1 route was already saved. ' +
        '1 route skipped: unknown airports, or ones Ryanair no longer flies from.';
      expect(status()?.textContent).toBe(text);
      expect(status()?.classList).not.toContain('error');
      expect(announced()).toBe(text);
    });

    it('says so when the file is not a routes file', async () => {
      await render([]);
      await upload(new File(['<html></html>'], 'page.html'));

      expect(status()?.textContent).toBe(
        "page.html isn't a routes file. Upload a file downloaded from Saved routes.",
      );
      expect(status()?.classList).toContain('error');
      expect(routeButtons()).toEqual([]);
    });

    it('does not read files that are too big', async () => {
      await render([]);
      const big = new File(['x'], 'big.json');
      Object.defineProperty(big, 'size', { value: 2_000_000 });
      const text = vi.spyOn(big, 'text');
      await upload(big);

      expect(text).not.toHaveBeenCalled();
      expect(status()?.textContent).toBe('big.json is too big to be a routes file.');
    });

    it('waits for the airports before uploading', async () => {
      await render([]);
      trip.airports.set([]);
      await fixture.whenStable();
      expect(element.querySelector<HTMLButtonElement>('.file-actions button')!.disabled).toBe(true);
    });
  });
});
