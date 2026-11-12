from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.api.dependencies import NetworkServiceDep
from app.schemas.network import AirportResponse, RouteResponse, RoutesQuery

router = APIRouter(prefix="/network", tags=["network"])


# Async on purpose: NetworkService uses the shared non-blocking httpx.AsyncClient.
@router.get("/airports", response_model=list[AirportResponse])
async def list_airports(service: NetworkServiceDep) -> Any:
    """All active Ryanair airports, with their country and coordinates."""
    return await service.get_airports()


@router.get("/routes", response_model=list[RouteResponse])
async def list_routes(
    params: Annotated[RoutesQuery, Query()],
    service: NetworkServiceDep,
) -> Any:
    """Direct routes from every Ryanair airport in the given origin country."""
    return await service.get_routes_from_country(params.origin_country)
