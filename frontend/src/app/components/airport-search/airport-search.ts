import { Component, computed, input, output, signal } from '@angular/core';
import { Airport } from '../../services/network';
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
let nextId = 0;

/**
 * A text box that suggests airports (and countries) as you type, following the ARIA combobox
 * pattern: arrow keys move through the list, Enter chooses, Escape closes.
 */
@Component({
  selector: 'app-airport-search',
  standalone: true,
  templateUrl: './airport-search.html',
  styleUrl: './airport-search.css',
})
export class AirportSearchComponent {
  label = input.required<string>();
  placeholder = input('');
  options = input<SearchOption[]>([]);
  value = input<SearchOption | null>(null);
  disabled = input(false);
  /** Shown under the box, e.g. why it is disabled. */
  hint = input('');

  chosen = output<SearchOption>();
  cleared = output<void>();

  readonly id = `airport-search-${nextId++}`;
  readonly query = signal('');
  readonly open = signal(false);
  /** True while the user is typing; otherwise the box shows the chosen option. */
  readonly editing = signal(false);
  readonly active = signal(0);

  readonly text = computed(() => (this.editing() ? this.query() : (this.value()?.title ?? '')));

  readonly results = computed<SearchOption[]>(() => {
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

  readonly activeId = computed(() =>
    this.open() && this.results().length ? this.optionId(this.active()) : null,
  );

  readonly status = computed(() => {
    if (!this.open() || !this.editing()) {
      return '';
    }
    const count = this.results().length;
    return count ? `${count} ${count === 1 ? 'result' : 'results'}` : 'No results';
  });

  optionId(index: number): string {
    return `${this.id}-option-${index}`;
  }

  onFocus(input: HTMLInputElement): void {
    input.select();
    this.openList();
  }

  onInput(text: string): void {
    this.query.set(text);
    this.editing.set(true);
    this.active.set(0);
    this.open.set(true);
  }

  onBlur(): void {
    this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.open()) {
          this.openList();
        } else if (count) {
          this.active.set((this.active() + 1) % count);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.open()) {
          this.openList();
          this.active.set(Math.max(count - 1, 0));
        } else if (count) {
          this.active.set((this.active() - 1 + count) % count);
        }
        break;
      case 'Enter': {
        const option = this.open() ? this.results()[this.active()] : undefined;
        if (option) {
          event.preventDefault();
          this.choose(option);
        }
        break;
      }
      case 'Escape':
        if (this.open() || this.editing()) {
          event.preventDefault();
          this.close();
        }
        break;
    }
  }

  choose(option: SearchOption): void {
    this.chosen.emit(option);
    this.close();
  }

  clear(input: HTMLInputElement): void {
    this.cleared.emit();
    this.query.set('');
    this.editing.set(false);
    input.focus();
  }

  private openList(): void {
    if (this.disabled()) {
      return;
    }
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
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
