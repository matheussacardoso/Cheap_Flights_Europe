import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatOption } from '@angular/material/core';
import { MatIconButton } from '@angular/material/button';
import {
  MatFormField,
  MatHint,
  MatLabel,
  MatPrefix,
  MatSuffix,
} from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { FlagUrlPipe } from '../../pipes/flag-url-pipe';
import { Airport } from '../../services/network-http-client';
import { Country } from '../../services/trip-selection';

/** One entry of the list: an airport, or "any airport" in a country. */
export interface SearchOption {
  kind: 'airport' | 'country';
  /** Airport IATA code or ISO country code. */
  code: string;
  title: string;
  subtitle: string;
  countryCode: string;
  /** Normalised text the query is matched against. */
  keywords: string;
}

export function airportOption(airport: Airport): SearchOption {
  return {
    kind: 'airport',
    code: airport.code,
    title: airport.name,
    subtitle: `${airport.city} · ${airport.countryName} · ${airport.code}`,
    countryCode: airport.countryCode,
    keywords: normalise(`${airport.code} ${airport.name} ${airport.city} ${airport.countryName}`),
  };
}

export function countryOption(country: Country): SearchOption {
  const count = country.airports.length;
  return {
    kind: 'country',
    code: country.code,
    title: `Any airport in ${country.name}`,
    subtitle: `${count} ${count === 1 ? 'airport' : 'airports'}`,
    countryCode: country.code,
    keywords: normalise(`${country.name} ${country.code}`),
  };
}

/** Lowercase without accents, so "malaga" finds "Málaga". */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MAX_RESULTS = 50;

/**
 * A text box that suggests airports (and countries) as you type: a Material autocomplete, so
 * the ARIA combobox pattern and the keys come with it (arrows move, Enter chooses, Escape
 * closes). Matching and ranking are ours: accents and case are ignored, codes rank first.
 */
@Component({
  selector: 'app-airport-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FlagUrlPipe,
    MatAutocomplete,
    MatAutocompleteTrigger,
    MatFormField,
    MatHint,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatOption,
    MatPrefix,
    MatSuffix,
  ],
  templateUrl: './airport-search.html',
  styleUrl: './airport-search.css',
})
export class AirportSearch {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly options = input<SearchOption[]>([]);
  readonly value = input<SearchOption | null>(null);
  readonly disabled = input(false);
  /** Shown under the box, e.g. why it is disabled. */
  readonly hint = input('');

  readonly chosen = output<SearchOption>();
  readonly cleared = output<void>();

  protected readonly query = signal('');
  /** True while the user is typing; otherwise the box shows the chosen option. */
  protected readonly editing = signal(false);

  /** What the box shows once an option is chosen (Material writes it into the input). */
  protected readonly displayTitle = (option: SearchOption | null): string => option?.title ?? '';

  protected readonly text = computed(() =>
    this.editing() ? this.query() : (this.value()?.title ?? ''),
  );

  protected readonly results = computed<SearchOption[]>(() => {
    const query = normalise(this.query().trim());
    if (!query) {
      return this.options().slice(0, MAX_RESULTS);
    }
    const scored: { option: SearchOption; score: number }[] = [];
    for (const option of this.options()) {
      const score = rank(option, query);
      if (score !== null) {
        scored.push({ option, score });
      }
    }
    return scored
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map(({ option }) => option);
  });

  /** The number of results while typing, for screen readers. */
  protected readonly status = computed(() => {
    if (!this.editing()) {
      return '';
    }
    const count = this.results().length;
    return count ? `${count} ${count === 1 ? 'result' : 'results'}` : 'No results';
  });

  /** Focus selects the text and lists everything (the list opens with Material). */
  protected onFocus(input: HTMLInputElement): void {
    input.select();
    this.query.set('');
  }

  protected onInput(text: string): void {
    this.query.set(text);
    this.editing.set(true);
  }

  protected choose(option: SearchOption): void {
    this.chosen.emit(option);
    this.close();
  }

  protected clear(input: HTMLInputElement): void {
    this.cleared.emit();
    this.close();
    input.focus();
  }

  /** The list closed (chosen, Escape, or focus left): show the chosen value again. */
  protected close(): void {
    this.editing.set(false);
    this.query.set('');
  }
}

/** Lower is better; null means no match. Codes first, then names that start with the query. */
function rank(option: SearchOption, query: string): number | null {
  if (option.code.toLowerCase() === query) {
    return 0;
  }
  const title = normalise(option.title);
  if (option.kind === 'airport' ? title.startsWith(query) : option.keywords.startsWith(query)) {
    return 1;
  }
  if (option.keywords.split(/[\s,()·-]+/).some((word) => word.startsWith(query))) {
    return 2;
  }
  return option.keywords.includes(query) ? 3 : null;
}
