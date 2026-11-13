import { Airport, Route } from '../services/network';

export function airport(
  code: string,
  countryCode: string,
  countryName: string,
  [latitude, longitude]: [number, number] = [0, 0],
): Airport {
  return {
    code,
    name: `${code} Airport`,
    city: `${code} City`,
    countryCode,
    countryName,
    latitude,
    longitude,
  };
}

/** Portugal (LIS, OPO) → Spain (AGP, MAD) and Morocco (RAK); Ireland (DUB) is unreachable. */
export const AIRPORTS: Airport[] = [
  airport('LIS', 'PT', 'Portugal', [38.77, -9.13]),
  airport('OPO', 'PT', 'Portugal', [41.24, -8.68]),
  airport('AGP', 'ES', 'Spain', [36.67, -4.49]),
  airport('MAD', 'ES', 'Spain', [40.47, -3.56]),
  airport('RAK', 'MA', 'Morocco', [31.61, -8.04]),
  airport('DUB', 'IE', 'Ireland', [53.42, -6.27]),
];

export const PT_ROUTES: Route[] = [
  { origin: 'LIS', destination: 'AGP', seasonal: false },
  { origin: 'OPO', destination: 'AGP', seasonal: false },
  { origin: 'OPO', destination: 'MAD', seasonal: true },
  { origin: 'OPO', destination: 'RAK', seasonal: false },
];

/** Return flights from Spain: MAD → OPO exists, so OPO → MAD can be swapped. */
export const ES_ROUTES: Route[] = [
  { origin: 'AGP', destination: 'LIS', seasonal: false },
  { origin: 'AGP', destination: 'OPO', seasonal: false },
  { origin: 'MAD', destination: 'OPO', seasonal: true },
];

/** Matches the routes request for one origin country. */
export function routesFor(country: string) {
  return (req: { url: string; params: { get(name: string): string | null } }) =>
    req.url.endsWith('/network/routes') && req.params.get('origin_country') === country;
}
