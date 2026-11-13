import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FlightService } from '../../services/flight';
import { TripSearchSelection } from '../../services/trip-selection';
import { TripPickerComponent } from '../trip-picker/trip-picker';

@Component({
  selector: 'app-flight-search',
  standalone: true,
  imports: [ReactiveFormsModule, TripPickerComponent],
  templateUrl: './flight-search.html',
  styleUrl: './flight-search.css',
})
export class FlightSearchComponent {
  private fb = inject(FormBuilder);
  private flightService = inject(FlightService);
  private router = inject(Router);

  // Signals, because the app is zoneless: plain fields set in async callbacks would not re-render.
  loading = signal(false);
  errorMessage = signal('');
  private submitted = signal(false);
  private trip = signal<TripSearchSelection | null>(null);

  /** A trip needs an origin airport and either a destination airport or "any" in a country. */
  readonly tripComplete = computed(() => {
    const trip = this.trip();
    return !!trip?.origin && (!!trip.destination || !!trip.destinationCountry);
  });
  readonly showTripError = computed(() => this.submitted() && !this.tripComplete());

  // origin/destination/destination_country have no inputs: the trip picker fills them.
  searchForm = this.fb.group({
    origin: ['', Validators.required],
    destination: [''],
    destination_country: [''],
    date_from: ['', Validators.required],
    date_to: [''],
    currency: ['EUR'],
  });

  onTripChange(selection: TripSearchSelection): void {
    this.trip.set(selection);
    this.searchForm.patchValue({
      origin: selection.origin ?? '',
      destination: selection.destination ?? '',
      destination_country: selection.destinationCountry ?? '',
    });
  }

  showError(name: string): boolean {
    const control = this.searchForm.get(name);
    return !!control && control.invalid && control.touched;
  }

  errorFor(name: string): string {
    return name === 'date_from' && this.searchForm.get(name)?.errors?.['required']
      ? 'Choose a departure date.'
      : '';
  }

  onSearch(): void {
    this.submitted.set(true);
    if (this.searchForm.invalid || !this.tripComplete()) {
      // Reveal the errors instead of silently disabling the button.
      this.searchForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const { origin, destination, destination_country, date_from, date_to, currency } =
      this.searchForm.getRawValue();
    this.flightService
      .searchFlights({
        origin: origin!,
        date_from: date_from!,
        destination: destination || undefined,
        destination_country: destination_country || undefined,
        date_to: date_to || undefined,
        currency: currency || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/results']);
        },
        error: () => {
          this.errorMessage.set('Could not load flights. Check that the backend is running.');
          this.loading.set(false);
        },
      });
  }
}
