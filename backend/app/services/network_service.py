import asyncio
import logging
import time
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError

from app.core.exceptions import UpstreamServiceError
from app.schemas.network import Airport, Route, UpstreamRoute

logger = logging.getLogger(__name__)

AIRPORTS_PATH = "/api/views/locate/5/airports/en/active"
ROUTES_PATH = "/api/views/locate/searchWidget/routes/en/airport/{code}"

_airports_adapter = TypeAdapter(list[Airport])
_routes_adapter = TypeAdapter(list[UpstreamRoute])


class NetworkService:
    """Ryanair's route network (airports and routes), from Ryanair's public website API.

    The upstream API is unofficial, so responses are cached in memory (per worker) and any
    failure surfaces as `UpstreamServiceError` (502).
    """

    def __init__(self, client: httpx.AsyncClient, ttl_seconds: int) -> None:
        self._client = client
        self._ttl = ttl_seconds
        self._cache: dict[str, tuple[float, Any]] = {}

    async def get_airports(self) -> list[Airport]:
        return await self._cached("airports", self._fetch_airports)

    async def get_routes_from_country(self, country_code: str) -> list[Route]:
        country_code = country_code.upper()
        airports = [a for a in await self.get_airports() if a.country_code == country_code]
        per_airport = await asyncio.gather(*(self._get_routes_from(a.code) for a in airports))
        return [route for routes in per_airport for route in routes]

    async def _get_routes_from(self, origin: str) -> list[Route]:
        async def fetch() -> list[Route]:
            payload = await self._get_json(ROUTES_PATH.format(code=origin))
            return [
                Route(origin=origin, destination=r.destination, seasonal=r.seasonal)
                for r in _routes_adapter.validate_python(payload)
            ]

        return await self._cached(f"routes:{origin}", fetch)

    async def _fetch_airports(self) -> list[Airport]:
        return _airports_adapter.validate_python(await self._get_json(AIRPORTS_PATH))

    async def _cached(self, key: str, fetch) -> Any:
        hit = self._cache.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        try:
            value = await fetch()
        except (httpx.HTTPError, ValidationError, ValueError) as exc:
            logger.exception("Ryanair network request failed", extra={"cache_key": key})
            raise UpstreamServiceError("Failed to fetch route data from the provider") from exc
        self._cache[key] = (time.monotonic() + self._ttl, value)
        logger.info("Network data fetched", extra={"cache_key": key})
        return value

    async def _get_json(self, path: str) -> Any:
        response = await self._client.get(path)
        response.raise_for_status()
        return response.json()
