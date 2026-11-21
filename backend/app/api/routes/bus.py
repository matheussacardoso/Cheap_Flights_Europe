from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.api.dependencies import AirportCityServiceDep, BusNetworkServiceDep, BusServiceDep
from app.schemas.bus import (
    AirportCityResponse,
    BusCityResponse,
    BusRideResponse,
    BusRouteResponse,
    BusRoutesQuery,
    BusSearchParams,
    BusTripResponse,
    BusTripSearchParams,
)

router = APIRouter(prefix="/bus", tags=["bus"])


# Async on purpose: the bus services use the shared non-blocking httpx.AsyncClient.
@router.get("/cities", response_model=list[BusCityResponse])
async def list_cities(service: BusNetworkServiceDep) -> Any:
    """All Flixbus cities, with their country and coordinates. Ids are UUIDs."""
    return await service.get_cities()


@router.get("/airport-cities", response_model=list[AirportCityResponse])
async def list_airport_cities(service: AirportCityServiceDep) -> Any:
    """The Flixbus city of each Ryanair airport that has one, to compare flights with buses."""
    return await service.get_airport_cities()


@router.get("/routes", response_model=list[BusRouteResponse])
async def list_routes(
    params: Annotated[BusRoutesQuery, Query()],
    service: BusNetworkServiceDep,
) -> Any:
    """Cities reachable from each departure city; `direct` is false when a change is needed."""
    return await service.get_routes_from(params.origin)


@router.get("/cheapest", response_model=list[BusRideResponse])
async def get_cheapest_rides(
    params: Annotated[BusSearchParams, Query()],
    service: BusServiceDep,
) -> Any:
    """Cheapest Flixbus ride per day and city pair in a period of up to 14 days."""
    return await service.get_cheapest_rides(params)


@router.get("/trips", response_model=list[BusTripResponse])
async def get_cheapest_trips(
    params: Annotated[BusTripSearchParams, Query()],
    service: BusServiceDep,
) -> Any:
    """Cheapest bus round trips on fixed weekdays (e.g., every Thursday to Monday) in a period."""
    return await service.get_cheapest_trips(params)
