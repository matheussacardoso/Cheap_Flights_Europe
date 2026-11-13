import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any

from ryanair import Ryanair
from ryanair.types import Flight, Trip

from app.core.exceptions import UpstreamServiceError
from app.schemas.flight import FlightSearchParams, TripSearchParams

logger = logging.getLogger(__name__)

# A period of several weeks means several fare queries; a few run in parallel (stay polite).
TRIP_QUERY_WORKERS = 4


class FlightService:
    """Business logic for searching flights. Keeps the Ryanair SDK out of the routes."""

    def get_cheapest_flights(self, params: FlightSearchParams) -> list[Flight]:
        kwargs: dict[str, Any] = {
            "airport": params.origin,
            "date_from": params.date_from,
            "date_to": params.date_to or params.date_from,
        }
        if params.destination:
            kwargs["destination_airport"] = params.destination
        if params.destination_country:
            # Ryanair's fare API only matches lowercase country codes ("es", not "ES").
            kwargs["destination_country"] = params.destination_country.lower()

        try:
            flights = Ryanair(currency=params.currency).get_cheapest_flights(**kwargs)
        except Exception as exc:
            logger.exception("Ryanair API request failed", extra={"search": kwargs})
            raise UpstreamServiceError() from exc

        logger.info("Flights fetched", extra={"search": kwargs, "results": len(flights)})
        # Returned as-is: the route's response_model converts them (no manual construction).
        return flights

    def get_cheapest_trips(self, params: TripSearchParams) -> list[Trip]:
        """Cheapest round trip for every departure day in the period, cheapest first.

        One fare query per (outbound, return) date pair, e.g. every Thursday to Monday. Each
        query returns the cheapest trip per destination, so a country search can return several
        trips per week.
        """
        destination: dict[str, Any] = {}
        if params.destination:
            destination["destination_airport"] = params.destination
        if params.destination_country:
            # Ryanair's fare API only matches lowercase country codes ("es", not "ES").
            destination["destination_country"] = params.destination_country.lower()
        windows = params.windows()

        try:
            ryanair = Ryanair(currency=params.currency)

            def search(window: tuple[date, date]) -> list[Trip]:
                outbound, inbound = window
                return ryanair.get_cheapest_return_flights(
                    params.origin, outbound, outbound, inbound, inbound, **destination
                )

            with ThreadPoolExecutor(max_workers=TRIP_QUERY_WORKERS) as pool:
                trips = [trip for found in pool.map(search, windows) for trip in found]
        except Exception as exc:
            logger.exception(
                "Ryanair round-trip request failed",
                extra={"origin": params.origin, "windows": len(windows), **destination},
            )
            raise UpstreamServiceError() from exc

        logger.info(
            "Trips fetched",
            extra={"origin": params.origin, "windows": len(windows), "results": len(trips)},
        )
        # Returned as-is: the route's response_model converts them (no manual construction).
        return sorted(trips, key=lambda trip: trip.totalPrice)
