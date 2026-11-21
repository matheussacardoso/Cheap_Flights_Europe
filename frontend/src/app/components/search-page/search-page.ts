import { DatePipe, ViewportScroller } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatOption } from '@angular/material/core';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { Router } from '@angular/router';
import { Observable, catchError, forkJoin, map, merge, of } from 'rxjs';
import { BusAvailability } from '../../services/bus-availability';
import { BusHttpClient, BusTripResponse } from '../../services/bus-http-client';
import { FlightHttpClient, TripSearchParams } from '../../services/flight-http-client';
import { SavedRoutes } from '../../services/saved-routes';
import { SearchResults } from '../../services/search-results';
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
import { LoadingIndicator } from '../loading-indicator/loading-indicator';
import { SavedRoutesList } from '../saved-routes-list/saved-routes-list';
import { TripFields } from '../trip-fields/trip-fields';

export type TripType = 'round-trip' | 'one-way';

/** A whole trip offered in the date selects: leaving on `date`, back on `returnDate`. */
interface DepartureOption {
  date: string;
  returnDate: string;
}

/** One of the one-click day presets, with what the button shows. */
interface PresetOption {
  preset: PeriodPreset;
  key: string;
  label: string;
  pressed: boolean;
}

const WEEKDAY_OPTIONS = WEEKDAYS.map((day) => ({ value: day, label: weekdayName(day) }));

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
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    LoadingIndicator,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    ReactiveFormsModule,
    SavedRoutesList,
    TripFields,
  ],
  templateUrl: './search-page.html',
  styleUrl: './search-page.css',
})
export class SearchPage {
  private readonly fb = inject(FormBuilder);
  private readonly flightHttpClient = inject(FlightHttpClient);
  private readonly busHttpClient = inject(BusHttpClient);
  protected readonly bus = inject(BusAvailability);
  private readonly searchResults = inject(SearchResults);
  private readonly router = inject(Router);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly today = toIsoDate(inject(TODAY)());
  protected readonly trip = inject(TripSelection);
  protected readonly savedRoutes = inject(SavedRoutes);

  protected readonly weekdayOptions = WEEKDAY_OPTIONS;

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  private readonly submitted = signal(false);

  protected readonly showTripError = computed(() => this.submitted() && !this.trip.isComplete());

  // origins/destination/destination_country have no inputs: they follow the trip store.
  protected readonly searchForm = this.fb.nonNullable.group(
    {
      origins: [[] as string[], Validators.required],
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

  /**
   * Bumped by every value, validity and touched change. Touched changes of a control don't reach
   * the group's own `events`, so the date controls are listened to as well.
   */
  private readonly formChange = toSignal(
    merge(
      this.searchForm.events,
      this.searchForm.controls.date_from.events,
      this.searchForm.controls.date_to.events,
    ),
  );

  /** The whole form value as a signal (`valueChanges` would give a partial value). */
  private readonly formValue = computed(() => {
    this.formChange();
    return this.searchForm.getRawValue();
  });

  protected readonly isRoundTrip = computed(() => this.formValue().trip_type === 'round-trip');

  protected readonly presets = computed<PresetOption[]>(() => {
    const { depart_day, return_day } = this.formValue();
    return PERIOD_PRESETS.map((preset) => ({
      preset,
      key: `${preset.departDay}-${preset.returnDay}`,
      label: presetLabel(preset),
      pressed: preset.departDay === depart_day && preset.returnDay === return_day,
    }));
  });

  /** "4 nights · 9 departures": what the chosen days and period add up to. */
  protected readonly periodSummary = computed(() => {
    const { depart_day, return_day, date_from, date_to } = this.formValue();
    const count = nights(depart_day, return_day);
    const parts = [`${count} ${count === 1 ? 'night' : 'nights'}`];
    const departures = date_from && date_to ? countWeekdays(date_from, date_to, depart_day) : 0;
    if (departures) {
      parts.push(`${departures} ${departures === 1 ? 'departure' : 'departures'} to compare`);
    }
    return parts.join(' · ');
  });

  /** Round trip: every departure day from today for about a year, e.g. every Thursday. */
  protected readonly firstDepartures = computed(() =>
    this.toDepartureOptions(
      weekdayDates(this.formValue().depart_day, this.today, FIRST_DEPARTURE_WEEKS),
    ),
  );

  /** Round trip: the same weekday from the first departure, up to the longest period. */
  protected readonly lastDepartures = computed(() => {
    const { depart_day, date_from } = this.formValue();
    const dates = weekdayDates(depart_day, date_from, Math.floor(MAX_PERIOD_DAYS / 7) + 1).filter(
      (date) => periodLength(date_from, date) <= MAX_PERIOD_DAYS,
    );
    return this.toDepartureOptions(dates);
  });

  /** Shown under the departure date once it was touched; '' when there is nothing to say. */
  protected readonly dateFromError = computed(() => {
    this.formChange();
    const control = this.searchForm.controls.date_from;
    if (!control.touched || !control.hasError('required')) {
      return '';
    }
    return this.isRoundTrip() ? 'Choose the first departure date.' : 'Choose a departure date.';
  });

  /** Shown under the last departure once it was touched; '' when the period is fine. */
  protected readonly dateToError = computed(() => {
    this.formChange();
    return this.searchForm.controls.date_to.touched ? this.periodError() : '';
  });

  /**
   * Under the route, for round trips: "Also compares Flixbus: Cologne → Paris", or why it can't.
   * Bus cities are named, since they can differ from the airport (Beauvais → Paris).
   */
  protected readonly busHint = computed(() => {
    if (!this.isRoundTrip() || !this.trip.isComplete()) {
      return '';
    }
    const { origins, destination } = this.bus.busTrip();
    if (this.bus.canCompare() && destination) {
      const from = origins.map((origin) => origin.cityName).join(', ');
      return `Also compares Flixbus buses: ${from} → ${destination.cityName}.`;
    }
    return this.bus.compareNote();
  });

  /** What the loading indicator says while a search runs. */
  protected readonly loadingText = computed(() => {
    const { depart_day, return_day, date_from, date_to } = this.formValue();
    const names = this.trip.originAirports().map((airport) => airport.name);
    const from = names.length ? names.join(', ') : 'your airport';
    const country = this.trip.countries().find((c) => c.code === this.trip.destinationCountry());
    const to =
      this.trip.destinationAirport()?.name ?? `any airport in ${country?.name ?? 'the country'}`;
    if (!this.isRoundTrip()) {
      return { title: 'Searching flights', detail: `Looking for flights from ${from} to ${to}.` };
    }
    const count = countWeekdays(date_from, date_to, depart_day);
    const days = `${weekdayName(depart_day)} → ${weekdayName(return_day)}`;
    const by = this.bus.canCompare() ? ', by plane and by bus' : '';
    return {
      title: 'Finding the cheapest dates',
      detail: `Comparing ${count} ${days} ${count === 1 ? 'trip' : 'trips'} from ${from} to ${to}${by}. This takes a few seconds.`,
    };
  });

  constructor() {
    this.trip.loadAirports();
    this.bus.load();
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
    // The form isn't signal-based: copy the trip store into it.
    effect(() => {
      const selection = this.trip.searchSelection();
      this.searchForm.patchValue({
        origins: selection.origins,
        destination: selection.destination ?? '',
        destination_country: selection.destinationCountry ?? '',
      });
    });
  }

  /** The preset matching the chosen days, for the toggle group; null when none does. */
  protected readonly pressedPreset = computed(
    () => this.presets().find((option) => option.pressed)?.key ?? null,
  );

  protected choosePreset(preset: PeriodPreset): void {
    this.searchForm.patchValue({ depart_day: preset.departDay, return_day: preset.returnDay });
  }

  /** A preset toggle was pressed. */
  protected choosePresetKey(key: string): void {
    const option = this.presets().find((preset) => preset.key === key);
    if (option) {
      this.choosePreset(option.preset);
    }
  }

  protected onSearch(): void {
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
      origin: value.origins,
      destination: value.destination || undefined,
      destination_country: value.destination_country || undefined,
      currency: value.currency || undefined,
    };
    const isRoundTrip = value.trip_type === 'round-trip';
    const period = {
      date_from: value.date_from,
      date_to: value.date_to,
      depart_day: value.depart_day,
      return_day: value.return_day,
      currency: route.currency,
    };
    // Each search stores its own kind of results, for the results page to read. Round trips
    // also search Flixbus between the airports' cities, at the same time, to compare.
    const search$: Observable<void> = isRoundTrip
      ? forkJoin([
          this.flightHttpClient.searchTrips({ ...route, ...period }),
          this.searchBuses(period),
        ]).pipe(
          map(([trips, bus]) => {
            this.searchResults.setTrips(trips);
            this.searchResults.setBusTrips(bus.trips, bus.note);
          }),
        )
      : this.flightHttpClient
          .searchFlights({
            ...route,
            date_from: value.date_from,
            date_to: value.date_to || undefined,
          })
          .pipe(map((flights) => this.searchResults.setFlights(flights)));

    search$.subscribe({
      next: () => {
        this.loading.set(false);
        // Results start at the top, not at the scroll position of this (long) form.
        this.router
          .navigate([isRoundTrip ? '/search/trips' : '/search/results'])
          .then(() => this.viewportScroller.scrollToPosition([0, 0]));
      },
      error: () => {
        this.errorMessage.set('Could not load flights. Check that the backend is running.');
        this.loading.set(false);
      },
    });
  }

  /**
   * The same round trip by Flixbus, between the airports' cities. Never fails the search: when
   * buses can't be compared or their search fails, the note says why and flights still show.
   */
  private searchBuses(
    period: Omit<TripSearchParams, 'origin'>,
  ): Observable<{ trips: BusTripResponse[]; note: string }> {
    const { origins, destination } = this.bus.busTrip();
    if (!this.bus.canCompare() || !destination) {
      return of({ trips: [], note: this.bus.compareNote() });
    }
    return this.busHttpClient
      .searchTrips({
        ...period,
        origin: origins.map((origin) => origin.city),
        destination: destination.city,
      })
      .pipe(
        map((trips) => ({
          trips,
          note: trips.length ? '' : 'Flixbus has no trips on these days.',
        })),
        catchError((error: unknown) => {
          const detail =
            error instanceof HttpErrorResponse && typeof error.error?.detail === 'string'
              ? error.error.detail
              : 'the search failed';
          return of({ trips: [], note: `Flixbus couldn't be compared: ${detail}` });
        }),
      );
  }

  /** Pairs each departure with its return, e.g. Thursday 3 Dec → Monday 7 Dec. */
  private toDepartureOptions(dates: string[]): DepartureOption[] {
    const { depart_day, return_day } = this.formValue();
    const away = nights(depart_day, return_day);
    return dates.map((date) => ({ date, returnDate: addDays(date, away) }));
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

  private periodError(): string {
    const errors = this.searchForm.errors ?? {};
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
      return `There is no ${weekdayName(this.searchForm.controls.depart_day.value)} in this period.`;
    }
    return '';
  }
}
