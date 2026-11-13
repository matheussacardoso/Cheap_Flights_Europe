import { Component, input } from '@angular/core';

/**
 * Shows that something is running and what: a spinner, a title ("Finding the cheapest dates")
 * and an optional detail ("Comparing 13 Thursday → Monday trips…"). It is a polite live region,
 * so screen readers announce it too. `compact` is the one-line version for small spaces.
 */
@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  templateUrl: './loading-indicator.html',
  styleUrl: './loading-indicator.css',
  host: { '[class.is-compact]': 'compact()' },
})
export class LoadingIndicatorComponent {
  title = input.required<string>();
  detail = input('');
  compact = input(false);
}
