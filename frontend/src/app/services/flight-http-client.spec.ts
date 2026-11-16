import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FlightHttpClient } from './flight-http-client';

describe('FlightHttpClient', () => {
  let service: FlightHttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FlightHttpClient);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
