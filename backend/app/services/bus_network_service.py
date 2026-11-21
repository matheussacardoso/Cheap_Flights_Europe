import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.exceptions import UpstreamServiceError
from app.schemas.bus import BusCity, BusRoute, UpstreamReachableCity

logger = logging.getLogger(__name__)

CITIES_PATH = "/cms/cities"
REACHABLE_PATH = "/cms/cities/{code}/reachable"
CITIES_PAGE_SIZE = 5000
# The reachable endpoint ignores `offset`, so everything must fit in one page (Berlin: ~2,200).
REACHABLE_LIMIT = 10000

# Flixbus also runs in the Americas, India and Australia. The app is about trips in and around
# Europe (the area the frontend map draws), so cities elsewhere are left out everywhere.
EUROPE = {
    "AD", "AL", "AT", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME",
    "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "SE", "SI", "SK", "SM", "UA", "VA", "XK",
}  # fmt: skip
# Turkey, the Caucasus, North Africa and the Middle East.
NEARBY = {"TR", "GE", "AM", "AZ", "MA", "DZ", "TN", "LY", "EG", "IL", "JO", "LB"}
SERVED_COUNTRIES = frozenset(EUROPE | NEARBY)

_cities_adapter = TypeAdapter(list[BusCity])
_reachable_adapter = TypeAdapter(list[UpstreamReachableCity])


class BusNetworkService:
    """Flixbus's network (cities and the cities reachable from each), from its public API.

    The upstream API is unofficial, so responses are cached in memory (per worker) and any
    failure surfaces as `UpstreamServiceError` (502).
    """

    def __init__(self, client: httpx.AsyncClient, ttl_seconds: int) -> None:
        self._client = client
        self._ttl = ttl_seconds
        self._cache: dict[str, tuple[float, Any]] = {}

    async def get_cities(self) -> list[BusCity]:
        return await self._cached("cities", self._fetch_cities)

    async def get_routes_from(self, origins: list[str]) -> list[BusRoute]:
        """Cities reachable from each origin, with or without a change on the way."""
        per_origin = await asyncio.gather(*(self._routes_from(origin) for origin in origins))
        return [route for routes in per_origin for route in routes]

    async def _routes_from(self, origin: str) -> list[BusRoute]:
        async def fetch() -> list[BusRoute]:
            payload = await self._get_json(
                REACHABLE_PATH.format(code=origin), {"language": "en", "limit": REACHABLE_LIMIT}
            )
            return [
                BusRoute(
                    origin=origin,
                    destination=city.code,
                    destination_country=city.country_code,
                    direct=not city.interconnection,
                    popularity=city.route_popularity,
                )
                for city in _reachable_adapter.validate_python(payload["result"])
                if city.code != origin and city.country_code in SERVED_COUNTRIES
            ]

        return await self._cached(f"routes:{origin}", fetch)

    async def _fetch_cities(self) -> list[BusCity]:
        # Paged with `offset`: about 6,000 cities worldwide, so two pages today.
        cities: list[BusCity] = []
        offset = 0
        while True:
            payload = await self._get_json(
                CITIES_PATH,
                {"language": "en", "limit": CITIES_PAGE_SIZE, "offset": offset},
            )
            page = _cities_adapter.validate_python(payload["result"])
            cities.extend(city for city in page if city.country_code in SERVED_COUNTRIES)
            offset += len(page)
            if len(page) < CITIES_PAGE_SIZE:
                return cities

    async def _cached[T](self, key: str, fetch: Callable[[], Awaitable[T]]) -> T:
        hit = self._cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        try:
            value = await fetch()
        except (httpx.HTTPError, ValidationError, ValueError, KeyError) as exc:
            logger.exception("Flixbus network request failed", extra={"cache_key": key})
            raise UpstreamServiceError("Failed to fetch bus data from the provider") from exc
        self._cache[key] = (time.monotonic() + self._ttl, value)
        logger.info("Bus network data fetched", extra={"cache_key": key})
        return value

    async def _get_json(self, path: str, params: dict[str, Any]) -> Any:
        response = await self._client.get(path, params=params)
        response.raise_for_status()
        return response.json()
