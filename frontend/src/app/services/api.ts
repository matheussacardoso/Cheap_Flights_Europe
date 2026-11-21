import { HttpParams } from '@angular/common/http';

/** Base URL of the FastAPI backend. */
export const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Query params from a search object. HttpParams sends empty values too, so optional fields that
 * aren't set are left out; arrays become a repeated param (`origin=A&origin=B`).
 */
export function toHttpParams(params: object): HttpParams {
  const set = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '' && value.length !== 0,
  );
  return new HttpParams({ fromObject: Object.fromEntries(set) });
}
