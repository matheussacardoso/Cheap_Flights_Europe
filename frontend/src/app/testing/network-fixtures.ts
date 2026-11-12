import { Airport, Route } from '../services/network';

export function airport(code: string, countryCode: string, countryName: string): Airport {
  return {
    code,
    name: `${code} Airport`,
    city: `${code} City`,
    countryCode,
    countryName,
    latitude: 0,
    longitude: 0,
  };
}

/** Portugal (LIS, OPO) → Spain (AGP, MAD) and Morocco (RAK); Ireland (DUB) is unreachable. */
export const AIRPORTS: Airport[] = [
  airport('LIS', 'PT', 'Portugal'),
  airport('OPO', 'PT', 'Portugal'),
  airport('AGP', 'ES', 'Spain'),
  airport('MAD', 'ES', 'Spain'),
  airport('RAK', 'MA', 'Morocco'),
  airport('DUB', 'IE', 'Ireland'),
];

export const PT_ROUTES: Route[] = [
  { origin: 'LIS', destination: 'AGP', seasonal: false },
  { origin: 'OPO', destination: 'AGP', seasonal: false },
  { origin: 'OPO', destination: 'MAD', seasonal: true },
  { origin: 'OPO', destination: 'RAK', seasonal: false },
];
