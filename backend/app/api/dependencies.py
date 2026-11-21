from typing import Annotated

from fastapi import Depends, Request

from app.services.airport_city_service import AirportCityService
from app.services.bus_network_service import BusNetworkService
from app.services.bus_service import BusService
from app.services.flight_service import FlightService
from app.services.network_service import NetworkService


def get_flight_service() -> FlightService:
    return FlightService()


def get_network_service(request: Request) -> NetworkService:
    # Created once in the lifespan, so its HTTP client and cache are shared across requests.
    return request.app.state.network_service


def get_bus_network_service(request: Request) -> BusNetworkService:
    # Created once in the lifespan, like NetworkService.
    return request.app.state.bus_network_service


def get_bus_service(request: Request) -> BusService:
    return request.app.state.bus_service


def get_airport_city_service(request: Request) -> AirportCityService:
    return request.app.state.airport_city_service


FlightServiceDep = Annotated[FlightService, Depends(get_flight_service)]
NetworkServiceDep = Annotated[NetworkService, Depends(get_network_service)]
BusNetworkServiceDep = Annotated[BusNetworkService, Depends(get_bus_network_service)]
BusServiceDep = Annotated[BusService, Depends(get_bus_service)]
AirportCityServiceDep = Annotated[AirportCityService, Depends(get_airport_city_service)]
