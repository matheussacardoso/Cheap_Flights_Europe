import { InjectionToken } from '@angular/core';

/** Weekdays as the API names them, Monday first (like the backend's `Weekday`). */
export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Mirrors the backend's limit: about three months of weekly trips. */
export const MAX_PERIOD_DAYS = 92;

export interface PeriodPreset {
  departDay: Weekday;
  returnDay: Weekday;
}

/** Common long-weekend patterns, shown as one-click choices. */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { departDay: 'thursday', returnDay: 'monday' },
  { departDay: 'wednesday', returnDay: 'monday' },
  { departDay: 'friday', returnDay: 'tuesday' },
  { departDay: 'friday', returnDay: 'sunday' },
];

export function weekdayName(day: Weekday): string {
  return day[0].toUpperCase() + day.slice(1);
}

/** "Thu → Mon" */
export function presetLabel(preset: PeriodPreset): string {
  return `${weekdayName(preset.departDay).slice(0, 3)} → ${weekdayName(preset.returnDay).slice(0, 3)}`;
}

/** Nights away: Thursday to Monday is 4, Friday to Friday is 7. Same rule as the backend. */
export function nights(departDay: Weekday, returnDay: Weekday): number {
  return (WEEKDAYS.indexOf(returnDay) - WEEKDAYS.indexOf(departDay) + 7) % 7 || 7;
}

/** How many times `day` falls between two ISO dates (inclusive); 0 if the dates are invalid. */
export function countWeekdays(from: string, to: string, day: Weekday): number {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end || end < start) {
    return 0;
  }
  const target = (WEEKDAYS.indexOf(day) + 1) % 7; // Date.getUTCDay(): Sunday is 0
  const offset = (target - start.getUTCDay() + 7) % 7;
  const span = daysBetween(start, end);
  return offset > span ? 0 : Math.floor((span - offset) / 7) + 1;
}

/** Days from one ISO date to another; NaN if either is invalid. */
export function periodLength(from: string, to: string): number {
  const start = parseDate(from);
  const end = parseDate(to);
  return start && end ? daysBetween(start, end) : NaN;
}

/** How far ahead the first departure can be chosen: about a year, like Ryanair's schedule. */
export const FIRST_DEPARTURE_WEEKS = 52;
/** Last departures offered by default after the first: 8 more weeks, 9 trips to compare. */
export const DEFAULT_PERIOD_WEEKS = 8;

/** Today's date; a token so tests can fix it. */
export const TODAY = new InjectionToken<() => Date>('TODAY', {
  factory: () => () => new Date(),
});

/** A local date as an ISO day, e.g. "2026-12-03". */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An ISO day moved by a number of days; '' if the input is invalid. */
export function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  if (!date) {
    return '';
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Up to `count` dates falling on `day`, on or after `from`, one week apart. */
export function weekdayDates(day: Weekday, from: string, count: number): string[] {
  const start = parseDate(from);
  if (!start) {
    return [];
  }
  const target = (WEEKDAYS.indexOf(day) + 1) % 7; // Date.getUTCDay(): Sunday is 0
  const first = addDays(from, (target - start.getUTCDay() + 7) % 7);
  return Array.from({ length: count }, (_, week) => addDays(first, week * 7));
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
