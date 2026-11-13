import {
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { OptionCardComponent } from '../option-card/option-card';
import { Airport } from '../../services/network';
import {
  ANY_AIRPORT,
  Country,
  TripSearchSelection,
  TripSelection,
} from '../../services/trip-selection';

export type Step = 'originCountry' | 'destinationCountry' | 'originAirport' | 'destinationAirport';

interface StepSummary {
  step: Step;
  label: string;
  value: string | null;
  flag: string | null;
}

const STEP_TITLES: Record<Step, string> = {
  originCountry: 'Where are you flying from?',
  destinationCountry: 'Where do you want to go?',
  originAirport: 'Choose your departure airport',
  destinationAirport: 'Choose your arrival airport',
};

/**
 * Step-by-step trip picker: origin country → destination country → origin airport →
 * destination airport. State lives in the shared `TripSelection` store.
 */
@Component({
  selector: 'app-trip-picker',
  standalone: true,
  imports: [OptionCardComponent],
  templateUrl: './trip-picker.html',
  styleUrl: './trip-picker.css',
})
export class TripPickerComponent implements OnInit {
  readonly trip = inject(TripSelection);
  private injector = inject(Injector);

  readonly ANY_AIRPORT = ANY_AIRPORT;
  readonly titles = STEP_TITLES;

  /** Emits the search parameters whenever the selection changes. */
  selectionChange = output<TripSearchSelection>();

  readonly filter = signal('');
  /** A completed step the user reopened with "Change"; null means the next open step. */
  private editing = signal<Step | null>(null);
  private heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  readonly activeStep = computed<Step | null>(() => {
    const editing = this.editing();
    if (editing) {
      return editing;
    }
    if (!this.trip.originCountry()) return 'originCountry';
    if (!this.trip.destinationCountry()) return 'destinationCountry';
    if (!this.trip.originAirport()) return 'originAirport';
    if (!this.trip.destinationAirport()) return 'destinationAirport';
    return null;
  });

  readonly originCountry = computed(() => this.country(this.trip.originCountry()));
  readonly destinationCountry = computed(() => this.country(this.trip.destinationCountry()));

  readonly summary = computed<StepSummary[]>(() => {
    const byCode = this.trip.airportsByCode();
    const origin = this.originCountry();
    const destination = this.destinationCountry();
    const originAirport = byCode.get(this.trip.originAirport() ?? '');
    const destinationAirport = this.trip.destinationAirport();
    return [
      {
        step: 'originCountry',
        label: 'From',
        value: origin?.name ?? null,
        flag: origin?.code ?? null,
      },
      {
        step: 'destinationCountry',
        label: 'To',
        value: destination?.name ?? null,
        flag: destination?.code ?? null,
      },
      {
        step: 'originAirport',
        label: 'Departure airport',
        value: originAirport ? this.airportLabel(originAirport) : null,
        flag: null,
      },
      {
        step: 'destinationAirport',
        label: 'Arrival airport',
        value:
          destinationAirport === ANY_AIRPORT
            ? `Any airport in ${destination?.name}`
            : this.labelFor(destinationAirport),
        flag: null,
      },
    ];
  });

  readonly visibleCountries = computed(() => this.matching(this.trip.countries(), (c) => c.name));

  readonly originAirports = computed(() =>
    this.matching(this.originCountry()?.airports ?? [], (a) => this.airportLabel(a)),
  );

  readonly destinationAirports = computed(() =>
    this.matching(this.destinationCountry()?.airports ?? [], (a) => this.airportLabel(a)),
  );

  /** Read out by screen readers when the options of the active step change. */
  readonly announcement = computed(() => {
    const step = this.activeStep();
    const origin = this.originCountry();
    const destination = this.destinationCountry();
    if (step === 'destinationCountry' && origin && !this.trip.loadingRoutes()) {
      const count = this.trip.reachableCountries().size;
      return `${count} of ${this.trip.countries().length} countries have direct flights from ${origin.name}.`;
    }
    if (step === 'originAirport' && destination) {
      const count = this.trip.originAirportsServingDestination().size;
      return `${count} airports in ${origin?.name} fly to ${destination.name}.`;
    }
    if (step === 'destinationAirport' && destination) {
      const count = this.trip.reachableDestinationAirports().size;
      return `${count} airports in ${destination.name} are reachable.`;
    }
    return '';
  });

  constructor() {
    effect(() => this.selectionChange.emit(this.trip.searchSelection()));
  }

  ngOnInit(): void {
    this.trip.loadAirports();
  }

  edit(step: Step): void {
    this.editing.set(step);
    this.afterStepChange();
  }

  chooseOriginCountry(code: string): void {
    this.trip.selectOriginCountry(code);
    this.afterChoice();
  }

  chooseDestinationCountry(code: string): void {
    this.trip.selectDestinationCountry(code);
    this.afterChoice();
  }

  chooseOriginAirport(code: string): void {
    this.trip.selectOriginAirport(code);
    this.afterChoice();
  }

  chooseDestinationAirport(code: string): void {
    this.trip.selectDestinationAirport(code);
    this.afterChoice();
  }

  airportLabel(airport: Airport): string {
    return airport.city === airport.name
      ? `${airport.name} (${airport.code})`
      : `${airport.name}, ${airport.city} (${airport.code})`;
  }

  airportCount(country: Country): string {
    return country.airports.length === 1 ? '1 airport' : `${country.airports.length} airports`;
  }

  private afterChoice(): void {
    this.editing.set(null);
    this.afterStepChange();
  }

  /** Clear the filter and move focus to the new step heading. */
  private afterStepChange(): void {
    this.filter.set('');
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  private country(code: string | null): Country | undefined {
    return this.trip.countries().find((country) => country.code === code);
  }

  private labelFor(code: string | null): string | null {
    const airport = code ? this.trip.airportsByCode().get(code) : undefined;
    return airport ? this.airportLabel(airport) : null;
  }

  private matching<T>(items: T[], text: (item: T) => string): T[] {
    const query = this.filter().trim().toLowerCase();
    return query ? items.filter((item) => text(item).toLowerCase().includes(query)) : items;
  }
}
