import { Component, input, output } from '@angular/core';

/**
 * A selectable card (country, airport, …). Unavailable cards stay focusable with
 * `aria-disabled` so screen-reader users still hear why they can't be chosen.
 */
@Component({
  selector: 'app-option-card',
  standalone: true,
  templateUrl: './option-card.html',
  styleUrl: './option-card.css',
})
export class OptionCardComponent {
  /** Value emitted on selection. */
  value = input.required<string>();
  title = input.required<string>();
  subtitle = input('');
  /** ISO country code for the flag, if any. */
  flag = input<string | null>(null);
  selected = input(false);
  highlighted = input(false);
  unavailable = input(false);
  /** Explains why an unavailable card can't be chosen. */
  reason = input('');

  choose = output<string>();

  onClick(): void {
    if (!this.unavailable()) {
      this.choose.emit(this.value());
    }
  }
}
