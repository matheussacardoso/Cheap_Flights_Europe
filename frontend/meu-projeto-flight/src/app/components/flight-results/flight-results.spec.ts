import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlightResults } from './flight-results';

describe('FlightResults', () => {
  let component: FlightResults;
  let fixture: ComponentFixture<FlightResults>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlightResults],
    }).compileComponents();

    fixture = TestBed.createComponent(FlightResults);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
