import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FlightSearchComponent } from './flight-search';

describe('FlightSearchComponent', () => {
  let component: FlightSearchComponent;
  let fixture: ComponentFixture<FlightSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlightSearchComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FlightSearchComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('asks for the trip and the date when submitting an empty form', async () => {
    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(compiled.textContent).toContain('Choose your departure and arrival airports.');
    expect(compiled.querySelector('#date_from-error')?.textContent).toContain('departure date');
    expect(compiled.querySelector('#date_from')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('fills the search form from the trip picker', () => {
    component.onTripChange({ origin: 'OPO', destination: null, destinationCountry: 'ES' });

    expect(component.searchForm.getRawValue()).toEqual(
      expect.objectContaining({ origin: 'OPO', destination: '', destination_country: 'ES' }),
    );
    expect(component.tripComplete()).toBe(true);
  });
});
