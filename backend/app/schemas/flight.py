from datetime import date, datetime
from typing import Annotated, Self

from pydantic import Field, StringConstraints, model_validator

from app.schemas.base import AppBaseModel, CamelModel

IataCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{3}$"),
]
CurrencyCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{3}$"),
]


class FlightSearchParams(AppBaseModel):
    """Query parameters for the cheapest-flights search."""

    origin: IataCode = Field(description="3-letter IATA code (e.g., LIS)")
    date_from: date = Field(description="Start date for search (YYYY-MM-DD)")
    destination: IataCode | None = Field(default=None, description="3-letter IATA code (e.g., CRL)")
    date_to: date | None = Field(default=None, description="End date for search (YYYY-MM-DD)")
    currency: CurrencyCode = Field(default="EUR", description="Currency code (e.g., EUR, GBP, USD)")

    @model_validator(mode="after")
    def check_date_range(self) -> Self:
        if self.date_to is not None and self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        return self


class FlightResponse(CamelModel):
    """A single flight. Validated directly from ryanair-py `Flight` objects (camelCase attrs)."""

    flight_number: str
    origin: str
    destination: str
    departure_time: datetime
    price: float
    currency: str
