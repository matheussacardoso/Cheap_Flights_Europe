import { Component, inject, signal } from '@angular/core';
import {
  ImportResult,
  ROUTES_FILE_MAX_BYTES,
  ROUTES_FILE_NAME,
  SavedRoute,
  SavedRoutes,
} from '../../services/saved-routes';
import { TripSelection } from '../../services/trip-selection';

/**
 * The user's saved routes: one click makes a route the current trip. They can be downloaded as
 * a JSON file and uploaded again, in this browser or another one.
 */
@Component({
  selector: 'app-saved-routes',
  standalone: true,
  templateUrl: './saved-routes.html',
  styleUrl: './saved-routes.css',
})
export class SavedRoutesComponent {
  readonly saved = inject(SavedRoutes);
  readonly trip = inject(TripSelection);

  /** Feedback for screen readers and for routes that can't be used any more. */
  readonly message = signal('');
  /** Visible outcome of the last upload. */
  readonly fileMessage = signal<{ text: string; isError: boolean } | null>(null);

  name(route: SavedRoute): string {
    return `${route.originName} to ${route.destinationName}`;
  }

  use(route: SavedRoute): void {
    if (!this.trip.airports().length) {
      return;
    }
    this.message.set(
      this.saved.use(route)
        ? `${this.name(route)} selected.`
        : `${this.name(route)} is no longer served by Ryanair.`,
    );
  }

  remove(route: SavedRoute): void {
    this.saved.remove(route.id);
    this.message.set(`${this.name(route)} removed from saved routes.`);
  }

  download(): void {
    const url = URL.createObjectURL(new Blob([this.saved.toFile()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = ROUTES_FILE_NAME;
    link.click();
    // Revoked after the click has started the download.
    setTimeout(() => URL.revokeObjectURL(url));
    const count = this.saved.routes().length;
    this.message.set(`${plural(count, 'route')} downloaded as ${ROUTES_FILE_NAME}.`);
  }

  async upload(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    // Cleared so that choosing the same file again uploads it again.
    input.value = '';
    if (!file || !this.trip.airports().length) {
      return;
    }
    if (file.size > ROUTES_FILE_MAX_BYTES) {
      this.showFileMessage(`${file.name} is too big to be a routes file.`, true);
      return;
    }
    let result: ImportResult | null = null;
    try {
      result = this.saved.importFile(await file.text());
    } catch {
      // Unreadable file: reported below like any other wrong file.
    }
    this.showFileMessage(
      result
        ? describe(result)
        : `${file.name} isn't a routes file. Upload a file downloaded from Saved routes.`,
      !result || (!result.added && !result.alreadySaved),
    );
  }

  private showFileMessage(text: string, isError: boolean): void {
    this.fileMessage.set({ text, isError });
    this.message.set(text);
  }
}

/** "Added 2 routes. 1 was already saved. 1 skipped: …" */
function describe({ added, alreadySaved, skipped }: ImportResult): string {
  if (!added && !alreadySaved && !skipped) {
    return 'That file has no routes.';
  }
  const parts = [added ? `Added ${plural(added, 'route')}.` : 'No new routes.'];
  if (alreadySaved) {
    parts.push(
      `${plural(alreadySaved, 'route')} ${alreadySaved === 1 ? 'was' : 'were'} already saved.`,
    );
  }
  if (skipped) {
    parts.push(
      `${plural(skipped, 'route')} skipped: unknown airports, or ones Ryanair no longer flies from.`,
    );
  }
  return parts.join(' ');
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
