from typing import Annotated

from fastapi import Depends, Request

from app.services.flight_service import FlightService
from app.services.network_service import NetworkService


def get_flight_service() -> FlightService:
    return FlightService()


def get_network_service(request: Request) -> NetworkService:
    # Created once in the lifespan, so its HTTP client and cache are shared across requests.
    return request.app.state.network_service


FlightServiceDep = Annotated[FlightService, Depends(get_flight_service)]
NetworkServiceDep = Annotated[NetworkService, Depends(get_network_service)]
