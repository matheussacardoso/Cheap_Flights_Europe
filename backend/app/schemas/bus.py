from datetime import date, datetime, timedelta
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    AliasChoices,
    AliasPath,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.base import AppBaseModel, CamelModel
from app.schemas.flight import MAX_ORIGINS, CurrencyCode, WeeklyPeriod, unique
from app.schemas.network import CountryCode

# Flixbus identifies cities by UUID (e.g. Berlin is 40d8f682-8646-11e6-9066-549f350fcb0c).
CityId = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
    ),
]

CityOrigins = Annotated[
    list[CityId],
    Field(min_length=1, max_length=MAX_ORIGINS),
    AfterValidator(unique),
]


def _not_in_the_past(value: date) -> date:
    # Flixbus rejects searches for past days.
    if value < date.today():
        raise ValueError("The date can't be in the past")
    return value


UpcomingDate = Annotated[date, AfterValidator(_not_in_the_past)]

# Flixbus searches one day per query, so a one-way search is one query per day and city pair.
MAX_BUS_SEARCH_DAYS = 14

_ORIGIN_DESCRIPTION = "1 to 3 departure city ids; repeat it: origin=<id>&origin=<id>"
_DESTINATION_DESCRIPTION = "Destination city id (from /bus/cities)"
_COUNTRY_DESCRIPTION = (
    "2-letter ISO country code: the most popular cities in it reachable from the origins"
)


# --- Upstream payloads (global.api.flixbus.com) -----------------------------------------------


class BusCity(AppBaseModel):
    """A Flixbus city, parsed from the upstream `cms/cities` payload."""

    code: str = Field(validation_alias=AliasChoices("uuid", "code"))
    name: str
    country_code: CountryCode = Field(validation_alias=AliasChoices("country", "country_code"))
    latitude: float = Field(validation_alias=AliasChoices(AliasPath("location", "lat"), "latitude"))
    longitude: float = Field(
        validation_alias=AliasChoices(AliasPath("location", "lon"), "longitude")
    )


class UpstreamReachableCity(AppBaseModel):
    """A city reachable from another one (`cms/cities/{id}/reachable`); only the fields we use."""

    code: str = Field(validation_alias="uuid")
    country_code: CountryCode = Field(validation_alias="country")
    # True when getting there needs a change of bus or train.
    interconnection: bool = False
    route_popularity: int = 0


class UpstreamLeg(AppBaseModel):
    """One bus or train of a ride; a ride with a change has several, each ending where the next
    starts (the change city)."""

    origin: str = Field(validation_alias=AliasPath("departure", "city_id"))
    destination: str = Field(validation_alias=AliasPath("arrival", "city_id"))
    departure_time: datetime = Field(validation_alias=AliasPath("departure", "date"))
    arrival_time: datetime = Field(validation_alias=AliasPath("arrival", "date"))
    means_of_transport: str = "bus"


class UpstreamRide(AppBaseModel):
    """One bookable ride from the upstream search; only the fields we use."""

    status: str
    origin: str = Field(validation_alias=AliasPath("departure", "city_id"))
    destination: str = Field(validation_alias=AliasPath("arrival", "city_id"))
    departure_time: datetime = Field(validation_alias=AliasPath("departure", "date"))
    arrival_time: datetime = Field(validation_alias=AliasPath("arrival", "date"))
    # What the customer pays: the fare plus Flixbus's platform fee.
    price: float = Field(
        validation_alias=AliasChoices(
            AliasPath("price", "total_with_platform_fee"), AliasPath("price", "total")
        )
    )
    legs: list[UpstreamLeg] = Field(min_length=1)


class UpstreamTripGroup(AppBaseModel):
    results: dict[str, UpstreamRide] = Field(default_factory=dict)


class UpstreamSearch(AppBaseModel):
    trips: list[UpstreamTripGroup] = Field(default_factory=list)


# --- Service results -------------------------------------------------------------------------


class BusRoute(AppBaseModel):
    origin: str
    destination: str
    destination_country: str
    direct: bool
    popularity: int


class BusRide(AppBaseModel):
    origin: str
    destination: str
    departure_time: datetime
    arrival_time: datetime
    price: float
    currency: str
    transfers: int
    # Names of the cities where the ride changes bus, in order; empty when direct.
    via: list[str]


class AirportCity(AppBaseModel):
    """The Flixbus city that stands for a Ryanair airport, to compare flights with buses."""

    airport: str
    city: str
    city_name: str


class BusTrip(AppBaseModel):
    total_price: float
    outbound: BusRide
    inbound: BusRide


# --- Query parameters ------------------------------------------------------------------------


class BusRoutesQuery(AppBaseModel):
    origin: CityOrigins = Field(description=_ORIGIN_DESCRIPTION)


class _BusDestination(AppBaseModel):
    """Bus searches need a destination: Flixbus can't search from a city to anywhere."""

    destination: CityId | None = Field(default=None, description=_DESTINATION_DESCRIPTION)
    destination_country: CountryCode | None = Field(default=None, description=_COUNTRY_DESCRIPTION)
    currency: CurrencyCode = Field(default="EUR", description="Currency code (e.g., EUR, GBP, CZK)")

    @model_validator(mode="after")
    def check_destination(self) -> Self:
        if self.destination and self.destination_country:
            raise ValueError("Send either destination or destination_country, not both")
        if not self.destination and not self.destination_country:
            raise ValueError("Send destination or destination_country")
        return self


class BusSearchParams(_BusDestination):
    """Query parameters for the cheapest one-way bus rides."""

    origin: CityOrigins = Field(description=_ORIGIN_DESCRIPTION)
    date_from: UpcomingDate = Field(description="First day of the search (YYYY-MM-DD)")
    date_to: date | None = Field(default=None, description="Last day of the search (YYYY-MM-DD)")

    @model_validator(mode="after")
    def check_period(self) -> Self:
        if self.date_to is not None and self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        if len(self.days()) > MAX_BUS_SEARCH_DAYS:
            raise ValueError(f"The period can be at most {MAX_BUS_SEARCH_DAYS} days long")
        return self

    def days(self) -> list[date]:
        last = self.date_to or self.date_from
        return [self.date_from + timedelta(days=d) for d in range((last - self.date_from).days + 1)]


class BusTripSearchParams(WeeklyPeriod, _BusDestination):
    """Query parameters for bus round trips on fixed weekdays, e.g. Thursday to Monday."""

    origin: CityOrigins = Field(description=_ORIGIN_DESCRIPTION)
    date_from: UpcomingDate = Field(
        description="First day the outbound trip may leave (YYYY-MM-DD)"
    )


# --- Responses -------------------------------------------------------------------------------


class BusCityResponse(CamelModel):
    code: str
    name: str
    country_code: str
    latitude: float
    longitude: float


class BusRouteResponse(CamelModel):
    origin: str
    destination: str
    destination_country: str
    direct: bool


class BusRideResponse(CamelModel):
    origin: str
    destination: str
    departure_time: datetime
    arrival_time: datetime
    price: float
    currency: str
    transfers: int
    # Names of the change cities, e.g. ["Karlsruhe", "Lyon"].
    via: list[str]


class AirportCityResponse(CamelModel):
    airport: str
    city: str
    city_name: str


class BusTripResponse(CamelModel):
    """A bus round trip. With several departure cities the return may end at another of them."""

    total_price: float
    outbound: BusRideResponse
    inbound: BusRideResponse

    @field_validator("total_price")
    @classmethod
    def round_price(cls, value: float) -> float:
        return round(value, 2)
