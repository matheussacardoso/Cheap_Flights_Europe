import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, merge } from 'rxjs';
import { FlightService } from '../../services/flight';
import { SavedRoutes } from '../../services/saved-routes';
import {
  DEFAULT_PERIOD_WEEKS,
  FIRST_DEPARTURE_WEEKS,
  MAX_PERIOD_DAYS,
  PERIOD_PRESETS,
  PeriodPreset,
  TODAY,
  WEEKDAYS,
  Weekday,
  addDays,
  countWeekdays,
  nights,
  periodLength,
  presetLabel,
  toIsoDate,
  weekdayDates,
  weekdayName,
} from '../../services/trip-period';
import { syncTripWithUrl } from '../../services/trip-url';
import { TripSelection } from '../../services/trip-selection';
import { LoadingIndicatorComponent } from '../loading-indicator/loading-indicator';
import { SavedRoutesComponent } from '../saved-routes/saved-routes';
import { TripFieldsComponent } from '../trip-fields/trip-fields';

export type TripType = 'round-trip' | 'one-way';

/** Round trips need a full period that contains the departure day, at most ~3 months long. */
function periodValidator(group: AbstractControl): ValidationErrors | null {
  const { trip_type, date_from, date_to, depart_day } = group.getRawValue();
  if (trip_type !== 'round-trip' || !date_from) {
    return null;
  }
  if (!date_to) {
    return { periodEndRequired: true };
  }
  const length = periodLength(date_from, date_to);
  if (length < 0) {
    return { periodReversed: true };
  }
  if (length > MAX_PERIOD_DAYS) {
    return { periodTooLong: true };
  }
  return countWeekdays(date_from, date_to, depart_day) ? null : { noDepartDay: true };
}

@Component({
  selector: 'app-flight-search',
  standalone: true,
  imports: [
    DatePipe,
    LoadingIndicatorComponent,
    ReactiveFormsModule,
    SavedRoutesComponent,
    TripFieldsComponent,
  ],
  templateUrl: './flight-search.html',
  styleUrl: './flight-search.css',
})
export class FlightSearchComponent {
  private fb = inject(FormBuilder);
  private flightService = inject(FlightService);
  private router = inject(Router);
  private today = toIsoDate(inject(TODAY)());
  readonly trip = inject(TripSelection);
  readonly savedRoutes = inject(SavedRoutes);

  readonly weekdays = WEEKDAYS;
  readonly presets = PERIOD_PRESETS;
  readonly presetLabel = presetLabel;
  readonly weekdayName = weekdayName;

  // Signals, because the app is zoneless: plain fields set in async callbacks would not re-render.
  loading = signal(false);
  errorMessage = signal('');
  private submitted = signal(false);

  readonly showTripError = computed(() => this.submitted() && !this.trip.isComplete());

  // origin/destination/destination_country have no inputs: they follow the trip store.
  searchForm = this.fb.nonNullable.group(
    {
      origin: ['', Validators.required],
      destination: [''],
      destination_country: [''],
      trip_type: ['round-trip' as TripType],
      depart_day: ['thursday' as Weekday],
      return_day: ['monday' as Weekday],
      date_from: ['', Validators.required],
      date_to: [''],
      currency: ['EUR'],
    },
    { validators: periodValidator },
  );

  private readonly form = toSignal(this.searchForm.valueChanges, {
    initialValue: this.searchForm.getRawValue(),
  });
  readonly isRoundTrip = computed(() => this.form().trip_type === 'round-trip');

  /** "4 nights · 9 departures": what the chosen days and period add up to. */
  readonly periodSummary = computed(() => {
    const { depart_day, return_day, date_from, date_to } = this.searchForm.getRawValue();
    this.form(); // re-run on every change
    const count = nights(depart_day, return_day);
    const parts = [`${count} ${count === 1 ? 'night' : 'nights'}`];
    const departures = date_from && date_to ? countWeekdays(date_from, date_to, depart_day) : 0;
    if (departures) {
      parts.push(`${departures} ${departures === 1 ? 'departure' : 'departures'} to compare`);
    }
    return parts.join(' · ');
  });

  /** Round trip: every departure day from today for about a year, e.g. every Thursday. */
  readonly firstDepartures = computed(() =>
    weekdayDates(this.form().depart_day ?? 'thursday', this.today, FIRST_DEPARTURE_WEEKS),
  );

  /** Round trip: the same weekday from the first departure, up to the longest period. */
  readonly lastDepartures = computed(() => {
    const { depart_day, date_from } = this.searchForm.getRawValue();
    this.form(); // re-run on every change
    return weekdayDates(depart_day, date_from, Math.floor(MAX_PERIOD_DAYS / 7) + 1).filter(
      (date) => periodLength(date_from, date) <= MAX_PERIOD_DAYS,
    );
  });

  /** What the loading indicator says while a search runs. */
  readonly loadingText = computed(() => {
    const { depart_day, return_day, date_from, date_to } = this.searchForm.getRawValue();
    this.form();
    const from = this.trip.originAirport()?.name ?? 'your airport';
    const country = this.trip.countries().find((c) => c.code === this.trip.destinationCountry());
    const to =
      this.trip.destinationAirport()?.name ?? `any airport in ${country?.name ?? 'the country'}`;
    if (!this.isRoundTrip()) {
      return { title: 'Searching flights', detail: `Looking for flights from ${from} to ${to}.` };
    }
    const count = countWeekdays(date_from, date_to, depart_day);
    const days = `${weekdayName(depart_day)} → ${weekdayName(return_day)}`;
    return {
      title: 'Finding the cheapest dates',
      detail: `Comparing ${count} ${days} ${count === 1 ? 'trip' : 'trips'} from ${from} to ${to}. This takes a few seconds.`,
    };
  });

  constructor() {
    this.trip.loadAirports();
    syncTripWithUrl();
    // Round trips only offer dates on the chosen weekdays: realign whenever the days change.
    const controls = this.searchForm.controls;
    merge(
      controls.trip_type.valueChanges,
      controls.depart_day.valueChanges,
      controls.date_from.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.alignPeriod());
    this.alignPeriod();
    effect(() => {
      const selection = this.trip.searchSelection();
      this.searchForm.patchValue({
        origin: selection.origin ?? '',
        destination: selection.destination ?? '',
        destination_country: selection.destinationCountry ?? '',
      });
    });
  }

  /** The return date of a trip leaving on `date`, e.g. Thursday 3 Dec → Monday 7 Dec. */
  returnDate(date: string): string {
    const { depart_day, return_day } = this.searchForm.getRawValue();
    return addDays(date, nights(depart_day, return_day));
  }

  /**
   * Keeps a round trip's first and last departure on the departure weekday: the first moves to
   * the next matching day, and the last keeps the same number of weeks after it (8 by default).
   */
  private alignPeriod(): void {
    const { trip_type, depart_day, date_from, date_to } = this.searchForm.getRawValue();
    if (trip_type !== 'round-trip') {
      return;
    }
    const start = date_from && date_from > this.today ? date_from : this.today;
    const first = weekdayDates(depart_day, start, 1)[0];
    const fits =
      !!date_to &&
      countWeekdays(date_to, date_to, depart_day) === 1 &&
      date_to >= first &&
      periodLength(first, date_to) <= MAX_PERIOD_DAYS;
    // Keep the length the user had; with none (or a last trip now before the first), 8 weeks.
    const span = date_from && date_to ? Math.round(periodLength(date_from, date_to) / 7) : 0;
    const weeks = Math.min(span > 0 ? span : DEFAULT_PERIOD_WEEKS, Math.floor(MAX_PERIOD_DAYS / 7));
    const last = fits ? date_to : addDays(first, weeks * 7);
    if (first !== date_from || last !== date_to) {
      // emitEvent false: this runs inside valueChanges, and the values are now consistent.
      this.searchForm.patchValue({ date_from: first, date_to: last }, { emitEvent: false });
      this.searchForm.updateValueAndValidity();
    }
  }

  isPreset(preset: PeriodPreset): boolean {
    const { depart_day, return_day } = this.form();
    return preset.departDay === depart_day && preset.returnDay === return_day;
  }

  choosePreset(preset: PeriodPreset): void {
    this.searchForm.patchValue({ depart_day: preset.departDay, return_day: preset.returnDay });
  }

  showError(name: string): boolean {
    const control = this.searchForm.get(name);
    if (name === 'date_to') {
      return !!control?.touched && !!this.periodError();
    }
    return !!control && control.invalid && control.touched;
  }

  errorFor(name: string): string {
    if (name === 'date_from' && this.searchForm.get(name)?.errors?.['required']) {
      return this.isRoundTrip() ? 'Choose the first departure date.' : 'Choose a departure date.';
    }
    return name === 'date_to' ? this.periodError() : '';
  }

  private periodError(): string {
    const errors = this.searchForm.errors ?? {};
    const day = weekdayName(this.searchForm.getRawValue().depart_day);
    if (errors['periodEndRequired']) {
      return 'Choose the last departure date.';
    }
    if (errors['periodReversed']) {
      return 'The last departure must be after the first.';
    }
    if (errors['periodTooLong']) {
      return `Choose a period of at most ${MAX_PERIOD_DAYS} days (about three months).`;
    }
    if (errors['noDepartDay']) {
      return `There is no ${day} in this period.`;
    }
    return '';
  }

  onSearch(): void {
    this.submitted.set(true);
    if (this.searchForm.invalid || !this.trip.isComplete()) {
      // Reveal the errors instead of silently disabling the button.
      this.searchForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const value = this.searchForm.getRawValue();
    const route = {
      origin: value.origin,
      destination: value.destination || undefined,
      destination_country: value.destination_country || undefined,
      currency: value.currency || undefined,
    };
    const search$: Observable<unknown> =
      value.trip_type === 'round-trip'
        ? this.flightService.searchTrips({
            ...route,
            date_from: value.date_from,
            date_to: value.date_to,
            depart_day: value.depart_day,
            return_day: value.return_day,
          })
        : this.flightService.searchFlights({
            ...route,
            date_from: value.date_from,
            date_to: value.date_to || undefined,
          });
    const resultsPage = value.trip_type === 'round-trip' ? '/search/trips' : '/search/results';

    search$.subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate([resultsPage]);
      },
      error: () => {
        this.errorMessage.set('Could not load flights. Check that the backend is running.');
        this.loading.set(false);
      },
    });
  }
}
