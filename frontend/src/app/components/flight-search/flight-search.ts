import { Component, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FlightService } from '../../services/flight';

const IATA_ERROR = 'Use a 3-letter IATA airport code.';

@Component({
  selector: 'app-flight-search',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './flight-search.html',
  styleUrl: './flight-search.css',
})
export class FlightSearchComponent {
  searchForm: FormGroup;
  // Signals, because the app is zoneless: plain fields set in async callbacks would not re-render.
  loading = signal(false);
  errorMessage = signal('');

  constructor(
    private fb: FormBuilder,
    private flightService: FlightService,
    private router: Router,
  ) {
    this.searchForm = this.fb.group({
      origin: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
      destination: ['', [Validators.minLength(3), Validators.maxLength(3)]],
      date_from: ['', Validators.required],
      date_to: [''],
      currency: ['EUR'],
    });
  }

  showError(name: string): boolean {
    const control = this.searchForm.get(name);
    return !!control && control.invalid && control.touched;
  }

  errorFor(name: string): string {
    const errors = this.searchForm.get(name)?.errors;
    if (!errors) {
      return '';
    }
    if (errors['required']) {
      return name === 'date_from' ? 'Choose a departure date.' : 'Enter an origin airport code.';
    }
    return IATA_ERROR;
  }

  onSearch(): void {
    if (this.searchForm.invalid) {
      // Reveal the field errors instead of silently disabling the button.
      this.searchForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.flightService.searchFlights(this.searchForm.value).subscribe({
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
