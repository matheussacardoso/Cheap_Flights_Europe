from typing import Annotated

from pydantic import AliasPath, Field, StringConstraints

from app.schemas.base import AppBaseModel, CamelModel

CountryCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{2}$"),
]


class Airport(AppBaseModel):
    """An airport in Ryanair's network, parsed from the upstream `locate` API payload."""

    code: str
    name: str
    city: str = Field(validation_alias=AliasPath("city", "name"))
    country_code: CountryCode = Field(validation_alias=AliasPath("country", "code"))
    country_name: str = Field(validation_alias=AliasPath("country", "name"))
    latitude: float = Field(validation_alias=AliasPath("coordinates", "latitude"))
    longitude: float = Field(validation_alias=AliasPath("coordinates", "longitude"))


class UpstreamRoute(AppBaseModel):
    """A route from the upstream `routes` API; only the fields we use."""

    destination: str = Field(validation_alias=AliasPath("arrivalAirport", "code"))
    seasonal: bool = False


class Route(AppBaseModel):
    origin: str
    destination: str
    seasonal: bool


class RoutesQuery(AppBaseModel):
    origin_country: CountryCode = Field(description="2-letter ISO country code (e.g., PT)")


class AirportResponse(CamelModel):
    code: str
    name: str
    city: str
    country_code: str
    country_name: str
    latitude: float
    longitude: float


class RouteResponse(CamelModel):
    origin: str
    destination: str
    seasonal: bool
