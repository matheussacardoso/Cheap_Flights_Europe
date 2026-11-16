import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FlightResultsPage } from './flight-results-page';

describe('FlightResultsPage', () => {
  let component: FlightResultsPage;
  let fixture: ComponentFixture<FlightResultsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlightResultsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(FlightResultsPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
