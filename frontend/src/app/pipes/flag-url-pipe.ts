import { Pipe, PipeTransform } from '@angular/core';

/**
 * A country's flag image, from the `flag-icons` SVGs copied to `flags/` (see `angular.json`).
 * Usage: `<img [src]="'PT' | flagUrl" alt="" />`.
 */
@Pipe({ name: 'flagUrl' })
export class FlagUrlPipe implements PipeTransform {
  transform(countryCode: string): string {
    return `flags/${countryCode.toLowerCase()}.svg`;
  }
}
