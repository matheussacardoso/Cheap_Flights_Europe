import logging
from typing import Any

from ryanair import Ryanair
from ryanair.types import Flight

from app.core.exceptions import UpstreamServiceError
from app.schemas.flight import FlightSearchParams

logger = logging.getLogger(__name__)


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
