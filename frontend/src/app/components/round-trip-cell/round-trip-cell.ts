import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One way of a trip, as the cell shows it. */
export interface LegView {
  /** "21:55 → 00:15", local to each end. */
  times: string;
  /** "2h 20m"; '' when unknown. */
  duration: string;
  minutes: number;
  /** "from Cologne", "to Cologne", "by bus". */
  place: string;
  /** Flight number, or "Direct" / "1 change · via Lyon". */
  detail: string;
  price: number;
}

/** A round trip by plane or by bus. */
export interface SideView {
  total: number;
  currency: string;
  outbound: LegView;
  inbound: LegView;
  /** The cheapest trip of the whole search, plane or bus. */
  isCheapest: boolean;
}

/** A results table cell: a round trip's total, then each way with times and duration. */
@Component({
  selector: 'app-round-trip-cell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe],
  templateUrl: './round-trip-cell.html',
  styleUrl: './round-trip-cell.css',
})
export class RoundTripCell {
  readonly side = input.required<SideView>();
}
