import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TripSearchSelection } from '../../services/trip-selection';
import { AIRPORTS, PT_ROUTES } from '../../testing/network-fixtures';
import { TripPickerComponent } from './trip-picker';

describe('TripPickerComponent', () => {
  let fixture: ComponentFixture<TripPickerComponent>;
  let http: HttpTestingController;
  let element: HTMLElement;
  let emitted: TripSearchSelection[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TripPickerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TripPickerComponent);
    element = fixture.nativeElement;
    emitted = [];
    fixture.componentInstance.selectionChange.subscribe((s) => emitted.push(s));

    await fixture.whenStable();
    http.expectOne((req) => req.url.endsWith('/network/airports')).flush(AIRPORTS);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function card(title: string): HTMLButtonElement {
    const button = [...element.querySelectorAll<HTMLButtonElement>('.option-card')].find((b) =>
      b.querySelector('.title')?.textContent?.trim().startsWith(title),
    );
    if (!button) {
      throw new Error(`No card titled "${title}"`);
    }
    return button;
  }

  async function click(title: string): Promise<void> {
    card(title).click();
    await fixture.whenStable();
  }

  async function chooseOriginCountry(): Promise<void> {
    await click('Portugal');
    http.expectOne((req) => req.url.endsWith('/network/routes')).flush(PT_ROUTES);
    await fixture.whenStable();
  }

  it('starts by asking for the origin country', () => {
    expect(element.querySelector('.step-title')?.textContent).toContain('flying from');
    expect(element.querySelectorAll('.option-card').length).toBe(4);
  });

  it('highlights reachable destination countries and blocks the others', async () => {
    await chooseOriginCountry();

    expect(card('Spain').classList).toContain('is-highlighted');
    expect(card('Morocco').classList).toContain('is-highlighted');
    expect(card('Ireland').getAttribute('aria-disabled')).toBe('true');
    expect(card('Ireland').textContent).toContain('No direct flights');

    await click('Ireland');
    expect(element.querySelector('.step-title')?.textContent).toContain('want to go');
  });

  it('emits a destination-country search for "Any airport"', async () => {
    await chooseOriginCountry();
    await click('Spain');
    expect(card('LIS Airport').getAttribute('aria-disabled')).toBeNull();
    await click('OPO Airport');
    await click('Any airport in Spain');

    expect(emitted.at(-1)).toEqual({ origin: 'OPO', destination: null, destinationCountry: 'ES' });
  });

  it('filters the visible cards', async () => {
    const filter = element.querySelector<HTMLInputElement>('#trip-filter')!;
    filter.value = 'spa';
    filter.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(element.querySelectorAll('.option-card').length).toBe(1);
    expect(card('Spain')).toBeTruthy();
  });

  it('lets the user go back and change a completed step', async () => {
    await chooseOriginCountry();
    await click('Spain');

    element.querySelector<HTMLButtonElement>('[aria-label="Change to"]')!.click();
    await fixture.whenStable();

    expect(element.querySelector('.step-title')?.textContent).toContain('want to go');
    expect(card('Spain').getAttribute('aria-pressed')).toBe('true');
  });
});
