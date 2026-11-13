import logging
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any

from ryanair import Ryanair
from ryanair.types import Flight, Trip

from app.core.exceptions import UpstreamServiceError
from app.schemas.flight import FlightSearchParams, TripSearchParams

logger = logging.getLogger(__name__)

# A search can mean many fare queries (weeks times airports); a few run in parallel (stay polite).
FARE_QUERY_WORKERS = 6


def _destination_filter(destination: str | None, country: str | None) -> dict[str, Any]:
    """SDK keyword arguments for "this airport" or "any airport in this country"."""
    if destination:
        return {"destination_airport": destination}
    if country:
        # Ryanair's fare API only matches lowercase country codes ("es", not "ES").
        return {"destination_country": country.lower()}
    return {}


def _in_parallel[T, R](search: Callable[[T], list[R]], items: Iterable[T]) -> list[R]:
    """Runs a blocking fare query per item on a small thread pool, and flattens the results."""
    with ThreadPoolExecutor(max_workers=FARE_QUERY_WORKERS) as pool:
        return [result for found in pool.map(search, items) for result in found]


class FlightService:
    """Business logic for searching flights. Keeps the Ryanair SDK out of the routes."""

    def get_cheapest_flights(self, params: FlightSearchParams) -> list[Flight]:
        """Cheapest one-way flights from any of the departure airports, cheapest first."""
        destination = _destination_filter(params.destination, params.destination_country)
        date_to = params.date_to or params.date_from

        try:
            ryanair = Ryanair(currency=params.currency)
            flights = _in_parallel(
                lambda origin: ryanair.get_cheapest_flights(
                    airport=origin, date_from=params.date_from, date_to=date_to, **destination
                ),
                params.origin,
            )
        except Exception as exc:
            logger.exception(
                "Ryanair API request failed", extra={"origins": params.origin, **destination}
            )
            raise UpstreamServiceError() from exc

        logger.info(
            "Flights fetched",
            extra={"origins": params.origin, **destination, "results": len(flights)},
        )
        # Returned as-is: the route's response_model converts them (no manual construction).
        return sorted(flights, key=lambda flight: flight.price)

    def get_cheapest_trips(self, params: TripSearchParams) -> list[Trip]:
        """Cheapest round trip for every departure day in the period, cheapest first.

        With one departure airport, one round-trip query per week (e.g. every Thursday to
        Monday). With several, the return may land at any of them, which Ryanair's round-trip
        search can't do: see `_open_jaw_trips`. Either way there is one trip per week and
        destination airport.
        """
        windows = params.windows()
        destination = _destination_filter(params.destination, params.destination_country)
        try:
            ryanair = Ryanair(currency=params.currency)
            if len(params.origin) == 1:
                trips = self._round_trips(ryanair, params.origin[0], windows, destination)
            else:
                trips = self._open_jaw_trips(ryanair, params.origin, windows, destination)
        except Exception as exc:
            logger.exception(
                "Ryanair trip request failed",
                extra={"origins": params.origin, "windows": len(windows), **destination},
            )
            raise UpstreamServiceError() from exc

        logger.info(
            "Trips fetched",
            extra={"origins": params.origin, "windows": len(windows), "results": len(trips)},
        )
        # Returned as-is: the route's response_model converts them (no manual construction).
        return sorted(trips, key=lambda trip: trip.totalPrice)

    @staticmethod
    def _round_trips(
        ryanair: Ryanair, origin: str, windows: list[tuple[date, date]], destination: dict
    ) -> list[Trip]:
        def search(window: tuple[date, date]) -> list[Trip]:
            out, back = window
            return ryanair.get_cheapest_return_flights(origin, out, out, back, back, **destination)

        return _in_parallel(search, windows)

    @staticmethod
    def _open_jaw_trips(
        ryanair: Ryanair, origins: list[str], windows: list[tuple[date, date]], destination: dict
    ) -> list[Trip]:
        """Out from any departure airport, back to any of them, built from one-way fares.

        1. Outbound: one query per departure airport and week. Keep the cheapest flight to each
           destination airport.
        2. Return: one query per destination airport and week, from that airport to anywhere.
           Keep the cheapest flight that lands at one of the departure airports.
        3. A trip is the cheapest outbound plus the cheapest return, for each week and
           destination airport that has both.
        """

        def outbound(job: tuple[str, date]) -> list[Flight]:
            origin, day = job
            return ryanair.get_cheapest_flights(
                airport=origin, date_from=day, date_to=day, **destination
            )

        cheapest_out: dict[tuple[date, str], Flight] = {}
        flights = _in_parallel(outbound, [(o, out) for out, _ in windows for o in origins])
        for flight in flights:
            key = (flight.departureTime.date(), flight.destination)
            if key not in cheapest_out or flight.price < cheapest_out[key].price:
                cheapest_out[key] = flight

        returns = {out: back for out, back in windows}

        def inbound(job: tuple[str, date]) -> list[Flight]:
            airport, day = job
            return ryanair.get_cheapest_flights(airport=airport, date_from=day, date_to=day)

        jobs = sorted({(airport, returns[out]) for out, airport in cheapest_out})
        cheapest_back: dict[tuple[date, str], Flight] = {}
        for flight in _in_parallel(inbound, jobs):
            if flight.destination not in origins:
                continue
            key = (flight.departureTime.date(), flight.origin)
            if key not in cheapest_back or flight.price < cheapest_back[key].price:
                cheapest_back[key] = flight

        trips = []
        for (out_day, airport), out_flight in cheapest_out.items():
            back_flight = cheapest_back.get((returns[out_day], airport))
            if back_flight:
                trips.append(
                    Trip(
                        totalPrice=out_flight.price + back_flight.price,
                        outbound=out_flight,
                        inbound=back_flight,
                    )
                )
        return trips
