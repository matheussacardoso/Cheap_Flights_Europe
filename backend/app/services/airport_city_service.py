import asyncio
import logging
import math
import unicodedata

from app.schemas.bus import AirportCity, BusCity
from app.schemas.network import Airport
from app.services.bus_network_service import BusNetworkService
from app.services.network_service import NetworkService

logger = logging.getLogger(__name__)

# A Flixbus city with the airport's city name counts if it is this close to the airport (Paris is
# 72 km from Beauvais airport, Düsseldorf about 70 km from Weeze).
SAME_NAME_MAX_KM = 100
# Otherwise the nearest Flixbus city counts if it is this close (Cluj airport → Cluj-Napoca).
NEAREST_MAX_KM = 30


def _normalise(name: str) -> str:
    """Lowercase without accents: "Düsseldorf" and "Dusseldorf" match."""
    return unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower().strip()


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance."""
    rad = math.radians
    h = (
        math.sin(rad(lat2 - lat1) / 2) ** 2
        + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(rad(lon2 - lon1) / 2) ** 2
    )
    return 6371 * 2 * math.asin(math.sqrt(h))


def _distance(airport: Airport, city: BusCity) -> float:
    return _km(airport.latitude, airport.longitude, city.latitude, city.longitude)


def match_airport_cities(airports: list[Airport], cities: list[BusCity]) -> list[AirportCity]:
    """The Flixbus city of each Ryanair airport that has one, to compare flights with buses.

    1. The city Ryanair names for the airport (its `city`), in the same country and close
       enough: Paris for Beauvais, so trips compare city to city.
    2. Otherwise the nearest Flixbus city in the same country, if close enough.

    Airports with neither (mostly islands, Morocco) are left out: there's no bus to compare.
    """
    by_name: dict[tuple[str, str], list[BusCity]] = {}
    by_country: dict[str, list[BusCity]] = {}
    for city in cities:
        by_name.setdefault((_normalise(city.name), city.country_code), []).append(city)
        by_country.setdefault(city.country_code, []).append(city)

    matches = []
    for airport in airports:
        named = [
            city
            for city in by_name.get((_normalise(airport.city), airport.country_code), [])
            if _distance(airport, city) <= SAME_NAME_MAX_KM
        ]
        nearby = by_country.get(airport.country_code, [])
        candidates = named or [c for c in nearby if _distance(airport, c) <= NEAREST_MAX_KM]
        if candidates:
            city = min(candidates, key=lambda c: _distance(airport, c))
            matches.append(AirportCity(airport=airport.code, city=city.code, city_name=city.name))
    return matches


class AirportCityService:
    """Links Ryanair's airports to Flixbus's cities. Both networks are cached by their services,
    so this only recomputes the (cheap) matching."""

    def __init__(self, network: NetworkService, bus_network: BusNetworkService) -> None:
        self._network = network
        self._bus_network = bus_network

    async def get_airport_cities(self) -> list[AirportCity]:
        airports, cities = await asyncio.gather(
            self._network.get_airports(), self._bus_network.get_cities()
        )
        matches = match_airport_cities(airports, cities)
        logger.info(
            "Airports matched to bus cities",
            extra={"airports": len(airports), "matched": len(matches)},
        )
        return matches
