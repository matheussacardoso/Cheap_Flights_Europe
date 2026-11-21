import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { FlagUrlPipe } from '../../pipes/flag-url-pipe';
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
  selector: 'app-saved-routes-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlagUrlPipe, MatButton, MatIcon, MatIconButton],
  templateUrl: './saved-routes-list.html',
  styleUrl: './saved-routes-list.css',
})
export class SavedRoutesList {
  private readonly document = inject(DOCUMENT);
  protected readonly saved = inject(SavedRoutes);
  protected readonly trip = inject(TripSelection);

  /** Feedback for screen readers and for routes that can't be used any more. */
  protected readonly message = signal('');
  /** Visible outcome of the last upload. */
  protected readonly fileMessage = signal<{ text: string; isError: boolean } | null>(null);

  /** The saved routes as the list shows them. */
  protected readonly items = computed(() => {
    const currentId = this.saved.current()?.id;
    return this.saved.routes().map((route) => ({
      route,
      name: routeName(route),
      isCurrent: route.id === currentId,
    }));
  });

  protected use(route: SavedRoute): void {
    if (!this.trip.airports().length) {
      return;
    }
    this.message.set(
      this.saved.use(route)
        ? `${routeName(route)} selected.`
        : `${routeName(route)} is no longer served by Ryanair.`,
    );
  }

  protected remove(route: SavedRoute): void {
    this.saved.remove(route.id);
    this.message.set(`${routeName(route)} removed from saved routes.`);
  }

  protected download(): void {
    const url = URL.createObjectURL(new Blob([this.saved.toFile()], { type: 'application/json' }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = ROUTES_FILE_NAME;
    link.click();
    // Revoked on the next task: revoking right away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url));
    const count = this.saved.routes().length;
    this.message.set(`${plural(count, 'route')} downloaded as ${ROUTES_FILE_NAME}.`);
  }

  protected async upload(input: HTMLInputElement): Promise<void> {
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

/** "Cologne to Malaga", for buttons and announcements. */
function routeName(route: SavedRoute): string {
  return `${route.originName} to ${route.destinationName}`;
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
