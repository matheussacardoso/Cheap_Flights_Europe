from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.api.dependencies import FlightServiceDep
from app.schemas.flight import FlightResponse, FlightSearchParams

router = APIRouter(prefix="/flights", tags=["flights"])


# Sync `def` on purpose: ryanair-py uses blocking `requests`, so FastAPI runs it in a threadpool.
# response_model does the conversion/validation of the SDK objects, so we don't build models here.
@router.get("/cheapest", response_model=list[FlightResponse])
def get_cheapest_flights(
    params: Annotated[FlightSearchParams, Query()],
    service: FlightServiceDep,
) -> Any:
    """Search for the cheapest Ryanair flights based on departure airport and date range."""
    return service.get_cheapest_flights(params)
