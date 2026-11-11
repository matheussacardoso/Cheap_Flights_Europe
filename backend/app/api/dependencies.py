from typing import Annotated

from fastapi import Depends

from app.services.flight_service import FlightService


def get_flight_service() -> FlightService:
    return FlightService()


FlightServiceDep = Annotated[FlightService, Depends(get_flight_service)]
