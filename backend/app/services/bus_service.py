import asyncio
import json
import logging
from collections.abc import Callable
from datetime import date

import httpx
from pydantic import ValidationError

from app.core.exceptions import InvalidSearchError, UpstreamServiceError
from app.schemas.bus import (
    BusRide,
    BusSearchParams,
    BusTrip,
    BusTripSearchParams,
    UpstreamSearch,
)
from app.services.bus_network_service import BusNetworkService

logger = logging.getLogger(__name__)

SEARCH_PATH = "/search/service/v4/search"
ONE_ADULT = json.dumps({"adult": 1}, separators=(",", ":"))

# Flixbus searches one city pair and one day per query, so a search can mean many queries.
# A few run at once (stay polite), and a search that needs too many is refused up front.
FARE_QUERY_CONCURRENCY = 8
MAX_FARE_QUERIES = 200
# "Any city in a country" searches the country's most popular cities reachable from the origins.
MAX_COUNTRY_DESTINATIONS = 5

# One fare query: (from city, to city, day).
Job = tuple[str, str, date]


class BusService:
    """Business logic for searching Flixbus rides. Keeps the Flixbus API out of the routes."""

    def __init__(self, client: httpx.AsyncClient, network: BusNetworkService) -> None:
        self._client = client
        self._network = network

    async def get_cheapest_rides(self, params: BusSearchParams) -> list[BusRide]:
        """Cheapest ride per day and city pair, from any of the departure cities, cheapest first."""
        pairs = await self._pairs(params.origin, params.destination, params.destination_country)
        jobs = [(origin, to, day) for origin, to in pairs for day in params.days()]
        _check_budget(len(jobs))

        found = await self._search_all(jobs, params.currency)
        rides = [ride for ride in found.values() if ride]
        logger.info(
            "Bus rides fetched",
            extra={"origins": params.origin, "queries": len(jobs), "results": len(rides)},
        )
        return sorted(rides, key=lambda ride: ride.price)

    async def get_cheapest_trips(self, params: BusTripSearchParams) -> list[BusTrip]:
        """Cheapest round trip per week and destination city, cheapest first.

        Built from one-way rides, so with several departure cities the return may end at
        another of them (open jaw), the same as flights:

        1. Outbound: one query per city pair and week. Keep the cheapest ride to each
           destination city.
        2. Return: one query per destination, departure city and week, only for destinations
           with an outbound ride. Keep the cheapest ride back to any departure city.
        3. A trip is the cheapest outbound plus the cheapest return, for each week and
           destination city that has both.
        """
        windows = params.windows()
        returns = dict(windows)
        pairs = await self._pairs(params.origin, params.destination, params.destination_country)
        out_jobs = [(origin, to, out) for out, _ in windows for origin, to in pairs]
        # Returns can need as many queries again; refuse before the first one.
        _check_budget(2 * len(out_jobs))

        cheapest_out = _cheapest_per(
            await self._search_all(out_jobs, params.currency), lambda job: (job[2], job[1])
        )
        back_jobs = [
            (to, origin, returns[out]) for out, to in cheapest_out for origin in params.origin
        ]
        cheapest_back = _cheapest_per(
            await self._search_all(back_jobs, params.currency), lambda job: (job[2], job[0])
        )

        trips = []
        for (out_day, to), outbound in cheapest_out.items():
            inbound = cheapest_back.get((returns[out_day], to))
            if inbound:
                trips.append(
                    BusTrip(
                        total_price=outbound.price + inbound.price,
                        outbound=outbound,
                        inbound=inbound,
                    )
                )
        logger.info(
            "Bus trips fetched",
            extra={
                "origins": params.origin,
                "windows": len(windows),
                "queries": len(out_jobs) + len(back_jobs),
                "results": len(trips),
            },
        )
        return sorted(trips, key=lambda trip: trip.total_price)

    async def _pairs(
        self, origins: list[str], destination: str | None, country: str | None
    ) -> list[tuple[str, str]]:
        """(from, to) city pairs to search: to the destination, or to cities in the country."""
        if destination:
            return [(origin, destination) for origin in origins if origin != destination]

        routes = [
            route
            for route in await self._network.get_routes_from(origins)
            if route.destination_country == country and route.destination not in origins
        ]
        popularity: dict[str, int] = {}
        for route in routes:
            popularity[route.destination] = max(
                popularity.get(route.destination, 0), route.popularity
            )
        top = set(sorted(popularity, key=lambda city: -popularity[city])[:MAX_COUNTRY_DESTINATIONS])
        return [(route.origin, route.destination) for route in routes if route.destination in top]

    async def _search_all(self, jobs: list[Job], currency: str) -> dict[Job, BusRide | None]:
        """The cheapest ride for each query, a few queries at a time."""
        limit = asyncio.Semaphore(FARE_QUERY_CONCURRENCY)
        # Change cities are named from the (cached) city list: rides only give their ids. Without
        # it the search still works, the changes are just unnamed.
        try:
            names = {city.code: city.name for city in await self._network.get_cities()}
        except UpstreamServiceError:
            names = {}

        async def run(job: Job) -> BusRide | None:
            async with limit:
                return await self._cheapest_ride(job, currency, names)

        try:
            rides = await asyncio.gather(*(run(job) for job in jobs))
        except (httpx.HTTPError, ValidationError, ValueError) as exc:
            logger.exception("Flixbus search request failed", extra={"queries": len(jobs)})
            raise UpstreamServiceError("Failed to fetch bus data from the provider") from exc
        return dict(zip(jobs, rides, strict=True))

    async def _cheapest_ride(
        self, job: Job, currency: str, names: dict[str, str]
    ) -> BusRide | None:
        origin, to, day = job
        response = await self._client.get(
            SEARCH_PATH,
            params={
                "from_city_id": origin,
                "to_city_id": to,
                "departure_date": day.strftime("%d.%m.%Y"),
                "products": ONE_ADULT,
                "currency": currency,
                "locale": "en",
                "search_by": "cities",
            },
        )
        if response.status_code == httpx.codes.BAD_REQUEST:
            # Flixbus explains bad searches, e.g. 'From city id "…" was not found!'.
            raise InvalidSearchError(_upstream_message(response))
        response.raise_for_status()

        rides = [
            ride
            for group in UpstreamSearch.model_validate(response.json()).trips
            for ride in group.results.values()
            if ride.status == "available"
        ]
        if not rides:
            return None
        cheapest = min(rides, key=lambda ride: ride.price)
        return BusRide(
            origin=cheapest.origin,
            destination=cheapest.destination,
            departure_time=cheapest.departure_time,
            arrival_time=cheapest.arrival_time,
            price=cheapest.price,
            currency=currency,
            transfers=len(cheapest.legs) - 1,
            # Each leg but the last ends where the ride changes.
            via=[names.get(leg.destination, "another city") for leg in cheapest.legs[:-1]],
        )


def _check_budget(queries: int) -> None:
    if queries > MAX_FARE_QUERIES:
        raise InvalidSearchError(
            f"This search needs {queries} fare queries, more than the {MAX_FARE_QUERIES} allowed. "
            "Choose a destination city, fewer departure cities or a shorter period."
        )


def _cheapest_per[K](found: dict[Job, BusRide | None], key: Callable[[Job], K]) -> dict[K, BusRide]:
    """The cheapest ride per key, e.g. per (day, destination city) across departure cities."""
    cheapest: dict[K, BusRide] = {}
    for job, ride in found.items():
        if ride and (key(job) not in cheapest or ride.price < cheapest[key(job)].price):
            cheapest[key(job)] = ride
    return cheapest


def _upstream_message(response: httpx.Response) -> str:
    try:
        return str(response.json()["message"])
    except (ValueError, KeyError, TypeError):
        return "Flixbus rejected the search"
