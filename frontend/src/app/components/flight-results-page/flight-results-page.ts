import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SearchResults } from '../../services/search-results';

/** One-way flights from the last search. */
@Component({
  selector: 'app-flight-results-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  templateUrl: './flight-results-page.html',
  styleUrl: './flight-results-page.css',
})
export class FlightResultsPage {
  protected readonly flights = inject(SearchResults).flights;
}
