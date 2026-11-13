from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Self

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.schemas.base import AppBaseModel, CamelModel
from app.schemas.network import CountryCode

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
    destination_country: CountryCode | None = Field(
        default=None, description="2-letter ISO country code: any airport in it (e.g., ES)"
    )
    date_to: date | None = Field(default=None, description="End date for search (YYYY-MM-DD)")
    currency: CurrencyCode = Field(default="EUR", description="Currency code (e.g., EUR, GBP, USD)")

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        if self.date_to is not None and self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        if self.destination and self.destination_country:
            raise ValueError("Send either destination or destination_country, not both")
        return self


class FlightResponse(CamelModel):
    """A single flight. Validated directly from ryanair-py `Flight` objects (camelCase attrs)."""

    flight_number: str
    origin: str
    destination: str
    departure_time: datetime
    price: float
    currency: str


class Weekday(StrEnum):
    """Day names in query params (e.g., depart_day=thursday). Order matches date.weekday()."""

    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"

    @property
    def index(self) -> int:
        return list(Weekday).index(self)


# About three months of weekly trips: each departure day in the period is one fare query.
MAX_TRIP_PERIOD_DAYS = 92


class TripSearchParams(AppBaseModel):
    """Query parameters for round trips on fixed weekdays, e.g. Thursday to Monday."""

    origin: IataCode = Field(description="3-letter IATA code (e.g., CGN)")
    destination: IataCode | None = Field(default=None, description="3-letter IATA code (e.g., PMI)")
    destination_country: CountryCode | None = Field(
        default=None, description="2-letter ISO country code: any airport in it (e.g., ES)"
    )
    date_from: date = Field(description="First day the outbound flight may leave (YYYY-MM-DD)")
    date_to: date = Field(description="Last day the outbound flight may leave (YYYY-MM-DD)")
    depart_day: Weekday = Field(description="Weekday of the outbound flight (e.g., thursday)")
    return_day: Weekday = Field(description="Weekday of the return flight (e.g., monday)")
    currency: CurrencyCode = Field(default="EUR", description="Currency code (e.g., EUR, GBP, USD)")

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        if (self.date_to - self.date_from).days > MAX_TRIP_PERIOD_DAYS:
            raise ValueError(f"The period can be at most {MAX_TRIP_PERIOD_DAYS} days long")
        if self.destination and self.destination_country:
            raise ValueError("Send either destination or destination_country, not both")
        if not self.windows():
            raise ValueError(f"There is no {self.depart_day.value} between date_from and date_to")
        return self

    @property
    def nights(self) -> int:
        """Nights away: Thursday to Monday is 4, Friday to Friday is 7."""
        return (self.return_day.index - self.depart_day.index) % 7 or 7

    def windows(self) -> list[tuple[date, date]]:
        """(outbound date, return date) for every departure day in the period."""
        offset = (self.depart_day.index - self.date_from.weekday()) % 7
        first = self.date_from + timedelta(days=offset)
        if first > self.date_to:
            return []
        return [
            (first + timedelta(days=d), first + timedelta(days=d + self.nights))
            for d in range(0, (self.date_to - first).days + 1, 7)
        ]


class TripResponse(CamelModel):
    """A round trip. Validated directly from ryanair-py `Trip` objects (camelCase attrs)."""

    total_price: float
    outbound: FlightResponse
    inbound: FlightResponse

    @field_validator("total_price")
    @classmethod
    def round_price(cls, value: float) -> float:
        # The SDK adds two float prices, which leaves noise like 78.28999999999999.
        return round(value, 2)
