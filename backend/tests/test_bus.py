import asyncio
from collections.abc import Callable
from datetime import date, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from app.schemas.bus import AirportCity, BusCity
from app.schemas.network import Airport
from app.services import bus_network_service, bus_service
from app.services.airport_city_service import match_airport_cities
from app.services.bus_network_service import BusNetworkService
from app.services.bus_service import BusService

BERLIN = "40d8f682-8646-11e6-9066-549f350fcb0c"
HAMBURG = "40d901a5-8646-11e6-9066-549f350fcb0c"
PRAGUE = "40e19c59-8646-11e6-9066-549f350fcb0c"
BRNO = "40e2a266-8646-11e6-9066-549f350fcb0c"
PLZEN = "40e1f0d6-8646-11e6-9066-549f350fcb0c"
PARIS = "40de8964-8646-11e6-9066-549f350fcb0c"
SAO_PAULO = "6c3a5a7e-1f0e-4a3c-9a52-4c4bb7f0b0a1"
NEW_YORK = "c0a8f1d2-3b4c-4d5e-8f60-718293a4b5c6"


def city(code: str, name: str, country: str) -> dict:
    return {"uuid": code, "name": name, "country": country, "location": {"lat": 50, "lon": 14}}


# Where rides with a change stop, in order: the first leg ends in Leipzig, the next in Dresden.
LEIPZIG = "40d91e53-8646-11e6-9066-549f350fcb0c"
DRESDEN = "40d8f7ba-8646-11e6-9066-549f350fcb0c"
CHANGE_CITIES = [LEIPZIG, DRESDEN]

CITIES = [
    city(BERLIN, "Berlin", "DE"),
    city(HAMBURG, "Hamburg", "DE"),
    city(SAO_PAULO, "São Paulo", "BR"),
    city(PRAGUE, "Prague", "CZ"),
    city(BRNO, "Brno", "CZ"),
    city(NEW_YORK, "New York", "US"),
    city(LEIPZIG, "Leipzig", "DE"),
    city(DRESDEN, "Dresden", "DE"),
]


def reachable(code: str, country: str, popularity: int, interconnection: bool = False) -> dict:
    return {
        "uuid": code,
        "country": country,
        "name": code[:8],
        "interconnection": interconnection,
        "route_popularity": popularity,
    }


REACHABLE = {
    BERLIN: [
        reachable(PRAGUE, "CZ", 900),
        reachable(BRNO, "CZ", 100, interconnection=True),
        reachable(PARIS, "FR", 500),
        reachable(HAMBURG, "DE", 800),
        reachable(NEW_YORK, "US", 999),
    ],
    HAMBURG: [reachable(PRAGUE, "CZ", 300), reachable(BERLIN, "DE", 800)],
}


def stop(day: date, hour: int, city_id: str) -> dict:
    return {"date": f"{day.isoformat()}T{hour:02d}:00:00+01:00", "city_id": city_id}


def ride(origin: str, to: str, day: date, price: float, *, legs: int = 1, status="available"):
    """A ride from 10:00 to 15:00; with `legs` > 1 it changes in Leipzig, then Dresden, one hour
    per leg."""
    cities = [origin, *CHANGE_CITIES[: legs - 1], to]
    return {
        "status": status,
        "departure": stop(day, 10, origin),
        "arrival": stop(day, 15, to),
        "price": {"total": price - 1, "total_with_platform_fee": price},
        "legs": [
            {
                "departure": stop(day, 10 + i, cities[i]),
                "arrival": stop(day, 15 if i == legs - 1 else 11 + i, cities[i + 1]),
                "means_of_transport": "bus",
            }
            for i in range(legs)
        ],
    }


# A fixed weekday in the future: dates in the past are refused.
FIRST_THURSDAY = date.today() + timedelta(days=(3 - date.today().weekday()) % 7 + 7)


class FakeFlixbus:
    """Fake upstream: fares per (from, to, day), and a log of the search queries."""

    def __init__(self) -> None:
        self.fares: dict[tuple[str, str, date], list[dict]] = {}
        self.searches: list[dict[str, str]] = []
        self.paths: list[str] = []

    def add(self, origin: str, to: str, day: date, *prices: float, legs: int = 1) -> None:
        self.fares[(origin, to, day)] = [ride(origin, to, day, p, legs=legs) for p in prices]

    def handler(self, request: httpx.Request) -> httpx.Response:
        path, query = request.url.path, dict(request.url.params)
        self.paths.append(path)
        if path == "/cms/cities":
            offset, limit = int(query["offset"]), int(query["limit"])
            return httpx.Response(200, json={"result": CITIES[offset : offset + limit]})
        if path.endswith("/reachable"):
            return httpx.Response(200, json={"result": REACHABLE.get(path.split("/")[-2], [])})
        self.searches.append(query)
        day = date(*map(int, reversed(query["departure_date"].split("."))))
        results = self.fares.get((query["from_city_id"], query["to_city_id"], day), [])
        return httpx.Response(
            200, json={"trips": [{"results": {str(i): r for i, r in enumerate(results)}}]}
        )


def make_services(
    handler: Callable[[httpx.Request], httpx.Response],
) -> tuple[BusNetworkService, BusService]:
    client = httpx.AsyncClient(
        base_url="https://upstream.test", transport=httpx.MockTransport(handler)
    )
    network = BusNetworkService(client, ttl_seconds=60)
    return network, BusService(client, network)


@pytest.fixture
def flixbus(override_bus) -> FakeFlixbus:
    fake = FakeFlixbus()
    override_bus(*make_services(fake.handler))
    return fake


# --- Network ---------------------------------------------------------------------------------


def test_cities_are_read_page_by_page_and_outside_europe_left_out(
    client: TestClient, flixbus: FakeFlixbus, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(bus_network_service, "CITIES_PAGE_SIZE", 3)

    response = client.get("/bus/cities")

    assert response.status_code == 200
    # Pages of 3: Berlin, Hamburg, São Paulo / Prague, Brno, New York / Leipzig, Dresden.
    assert [c["name"] for c in response.json()] == [
        "Berlin",
        "Hamburg",
        "Prague",
        "Brno",
        "Leipzig",
        "Dresden",
    ]
    assert response.json()[0] == {
        "code": BERLIN,
        "name": "Berlin",
        "countryCode": "DE",
        "latitude": 50,
        "longitude": 14,
    }
    assert flixbus.paths.count("/cms/cities") == 3


def test_routes_say_whether_a_change_is_needed(client: TestClient, flixbus: FakeFlixbus) -> None:
    response = client.get("/bus/routes", params={"origin": [BERLIN.upper()]})

    assert response.status_code == 200
    assert response.json()[:2] == [
        {"origin": BERLIN, "destination": PRAGUE, "destinationCountry": "CZ", "direct": True},
        {"origin": BERLIN, "destination": BRNO, "destinationCountry": "CZ", "direct": False},
    ]


def test_routes_outside_europe_are_left_out(client: TestClient, flixbus: FakeFlixbus) -> None:
    response = client.get("/bus/routes", params={"origin": [BERLIN]})

    assert NEW_YORK not in {r["destination"] for r in response.json()}


def test_routes_are_merged_across_origins(client: TestClient, flixbus: FakeFlixbus) -> None:
    response = client.get("/bus/routes", params={"origin": [BERLIN, HAMBURG]})

    assert [(r["origin"], r["destination"]) for r in response.json()][-2:] == [
        (HAMBURG, PRAGUE),
        (HAMBURG, BERLIN),
    ]


def test_network_responses_are_cached(flixbus: FakeFlixbus) -> None:
    network, _ = make_services(flixbus.handler)

    async def run() -> None:
        await network.get_routes_from([BERLIN])
        await network.get_routes_from([BERLIN])
        await network.get_cities()
        await network.get_cities()

    asyncio.run(run())

    assert len(flixbus.paths) == 2


def test_network_failure_is_a_502(client: TestClient, override_bus) -> None:
    override_bus(*make_services(lambda _: httpx.Response(503)))

    response = client.get("/bus/cities")

    assert response.status_code == 502


# --- Ryanair airports ↔ Flixbus cities -------------------------------------------------------


def airport(code: str, city_name: str, country: str, lat: float, lon: float) -> Airport:
    return Airport.model_validate(
        {
            "code": code,
            "name": code,
            "city": {"name": city_name},
            "country": {"code": country, "name": country},
            "coordinates": {"latitude": lat, "longitude": lon},
        }
    )


def bus_city(code: str, name: str, country: str, lat: float, lon: float) -> BusCity:
    return BusCity(code=code, name=name, country_code=country, latitude=lat, longitude=lon)


PARIS_CITY = bus_city("paris", "Paris", "FR", 48.86, 2.35)
BEAUVAIS_CITY = bus_city("beauvais", "Beauvais", "FR", 49.43, 2.08)
CLUJ_CITY = bus_city("cluj", "Cluj-Napoca", "RO", 46.77, 23.6)
DUSSELDORF_CITY = bus_city("dus", "Düsseldorf", "DE", 51.22, 6.78)


def test_airports_match_their_city_first_then_the_nearest_city() -> None:
    airports = [
        # Paris Beauvais: Ryanair's city is Paris (72 km), not the town next to the airport.
        airport("BVA", "Paris", "FR", 49.45, 2.11),
        # Weeze: "Dusseldorf" matches "Düsseldorf" despite the accent.
        airport("NRN", "Dusseldorf", "DE", 51.6, 6.14),
        # Cluj: no city of that name, but Cluj-Napoca is 5 km away.
        airport("CLJ", "Cluj", "RO", 46.79, 23.69),
        # Lanzarote: no bus anywhere near.
        airport("ACE", "Lanzarote", "ES", 28.95, -13.6),
    ]
    cities = [PARIS_CITY, BEAUVAIS_CITY, CLUJ_CITY, DUSSELDORF_CITY]

    matches = match_airport_cities(airports, cities)

    assert [(m.airport, m.city_name) for m in matches] == [
        ("BVA", "Paris"),
        ("NRN", "Düsseldorf"),
        ("CLJ", "Cluj-Napoca"),
    ]


def test_a_same_name_city_far_away_doesnt_count() -> None:
    # A "Paris" airport in France, but 600 km from the Flixbus Paris: the nearest city wins.
    far = airport("XXX", "Paris", "FR", 43.6, 1.44)
    near = bus_city("toulouse", "Toulouse", "FR", 43.6, 1.44)

    matches = match_airport_cities([far], [PARIS_CITY, near])

    assert [m.city_name for m in matches] == ["Toulouse"]


def test_airport_cities_endpoint(client: TestClient, override_airport_cities) -> None:
    class FakeService:
        async def get_airport_cities(self) -> list[AirportCity]:
            return [AirportCity(airport="BVA", city="paris", city_name="Paris")]

    override_airport_cities(FakeService())

    response = client.get("/bus/airport-cities")

    assert response.json() == [{"airport": "BVA", "city": "paris", "cityName": "Paris"}]


# --- One-way search --------------------------------------------------------------------------


def test_cheapest_ride_per_day_cheapest_first(client: TestClient, flixbus: FakeFlixbus) -> None:
    day1, day2 = FIRST_THURSDAY, FIRST_THURSDAY + timedelta(days=1)
    flixbus.add(BERLIN, PRAGUE, day1, 30, 25.5)
    flixbus.add(BERLIN, PRAGUE, day2, 19.9, legs=2)
    flixbus.fares[(BERLIN, PRAGUE, day2)].append(
        ride(BERLIN, PRAGUE, day2, 5, status="unavailable")
    )

    response = client.get(
        "/bus/cheapest",
        params={
            "origin": [BERLIN],
            "destination": PRAGUE,
            "date_from": day1.isoformat(),
            "date_to": day2.isoformat(),
            "currency": "czk",
        },
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "origin": BERLIN,
            "destination": PRAGUE,
            "departureTime": f"{day2.isoformat()}T10:00:00+01:00",
            "arrivalTime": f"{day2.isoformat()}T15:00:00+01:00",
            "price": 19.9,
            "currency": "CZK",
            "transfers": 1,
            "via": ["Leipzig"],
        },
        {
            "origin": BERLIN,
            "destination": PRAGUE,
            "departureTime": f"{day1.isoformat()}T10:00:00+01:00",
            "arrivalTime": f"{day1.isoformat()}T15:00:00+01:00",
            "price": 25.5,
            "currency": "CZK",
            "transfers": 0,
            "via": [],
        },
    ]
    assert flixbus.searches[0] == {
        "from_city_id": BERLIN,
        "to_city_id": PRAGUE,
        "departure_date": day1.strftime("%d.%m.%Y"),
        "products": '{"adult":1}',
        "currency": "CZK",
        "locale": "en",
        "search_by": "cities",
    }


def test_country_search_covers_its_most_popular_reachable_cities(
    client: TestClient, flixbus: FakeFlixbus, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(bus_service, "MAX_COUNTRY_DESTINATIONS", 1)
    flixbus.add(BERLIN, PRAGUE, FIRST_THURSDAY, 20)
    flixbus.add(HAMBURG, PRAGUE, FIRST_THURSDAY, 15)

    response = client.get(
        "/bus/cheapest",
        params={
            "origin": [BERLIN, HAMBURG],
            "destination_country": "cz",
            "date_from": FIRST_THURSDAY.isoformat(),
        },
    )

    assert response.status_code == 200
    assert [(r["origin"], r["price"]) for r in response.json()] == [(HAMBURG, 15), (BERLIN, 20)]
    # Brno (less popular) is left out, and Hamburg isn't searched as a destination.
    assert {(q["from_city_id"], q["to_city_id"]) for q in flixbus.searches} == {
        (BERLIN, PRAGUE),
        (HAMBURG, PRAGUE),
    }


def test_too_broad_a_search_is_refused_before_querying(
    client: TestClient, flixbus: FakeFlixbus, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(bus_service, "MAX_FARE_QUERIES", 3)

    response = client.get(
        "/bus/cheapest",
        params={
            "origin": [BERLIN],
            "destination": PRAGUE,
            "date_from": FIRST_THURSDAY.isoformat(),
            "date_to": (FIRST_THURSDAY + timedelta(days=3)).isoformat(),
        },
    )

    assert response.status_code == 422
    assert "4 fare queries" in response.json()["detail"]
    assert flixbus.searches == []


def test_flixbus_rejection_is_passed_on(client: TestClient, override_bus) -> None:
    message = 'From city id "00000000-0000-0000-0000-000000000000" was not found!'
    override_bus(*make_services(lambda _: httpx.Response(400, json={"message": message})))

    response = client.get(
        "/bus/cheapest",
        params={
            "origin": ["00000000-0000-0000-0000-000000000000"],
            "destination": PRAGUE,
            "date_from": FIRST_THURSDAY.isoformat(),
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": message}


def test_search_failure_is_a_502(client: TestClient, override_bus) -> None:
    override_bus(*make_services(lambda _: httpx.Response(500)))

    response = client.get(
        "/bus/cheapest",
        params={"origin": [BERLIN], "destination": PRAGUE, "date_from": FIRST_THURSDAY.isoformat()},
    )

    assert response.status_code == 502


@pytest.mark.parametrize(
    "overrides",
    [
        {"destination": None},
        {"destination_country": "CZ"},
        {"origin": ["berlin"]},
        {"date_from": (date.today() - timedelta(days=1)).isoformat()},
        {"date_to": (FIRST_THURSDAY + timedelta(days=14)).isoformat()},
        {"date_to": (FIRST_THURSDAY - timedelta(days=1)).isoformat()},
    ],
)
def test_invalid_searches_are_rejected(
    client: TestClient, flixbus: FakeFlixbus, overrides: dict
) -> None:
    params = {"origin": [BERLIN], "destination": PRAGUE, "date_from": FIRST_THURSDAY.isoformat()}
    params = {k: v for k, v in (params | overrides).items() if v is not None}

    response = client.get("/bus/cheapest", params=params)

    assert response.status_code == 422
    assert flixbus.searches == []


# --- Round trips -----------------------------------------------------------------------------


def trip_params(**overrides) -> dict:
    return {
        "origin": [BERLIN],
        "destination": PRAGUE,
        "date_from": FIRST_THURSDAY.isoformat(),
        "date_to": (FIRST_THURSDAY + timedelta(days=13)).isoformat(),
        "depart_day": "thursday",
        "return_day": "monday",
    } | overrides


def test_round_trips_per_week_cheapest_first(client: TestClient, flixbus: FakeFlixbus) -> None:
    week2 = FIRST_THURSDAY + timedelta(days=7)
    flixbus.add(BERLIN, PRAGUE, FIRST_THURSDAY, 20.1)
    flixbus.add(PRAGUE, BERLIN, FIRST_THURSDAY + timedelta(days=4), 10.2)
    flixbus.add(BERLIN, PRAGUE, week2, 12)
    flixbus.add(PRAGUE, BERLIN, week2 + timedelta(days=4), 9)

    response = client.get("/bus/trips", params=trip_params())

    assert response.status_code == 200
    trips = response.json()
    assert [t["totalPrice"] for t in trips] == [21, 30.3]
    assert trips[0]["outbound"]["departureTime"].startswith(week2.isoformat())
    assert trips[0]["inbound"]["departureTime"].startswith((week2 + timedelta(days=4)).isoformat())


def test_week_without_a_return_is_dropped(client: TestClient, flixbus: FakeFlixbus) -> None:
    flixbus.add(BERLIN, PRAGUE, FIRST_THURSDAY, 20)
    flixbus.add(BERLIN, PRAGUE, FIRST_THURSDAY + timedelta(days=7), 12)

    response = client.get("/bus/trips", params=trip_params())

    assert response.json() == []
    # Returns are only searched for weeks with an outbound ride.
    assert len(flixbus.searches) == 2 + 2


def test_open_jaw_trip_returns_to_another_departure_city(
    client: TestClient, flixbus: FakeFlixbus
) -> None:
    monday = FIRST_THURSDAY + timedelta(days=4)
    flixbus.add(BERLIN, PRAGUE, FIRST_THURSDAY, 30)
    flixbus.add(HAMBURG, PRAGUE, FIRST_THURSDAY, 20)
    flixbus.add(PRAGUE, BERLIN, monday, 15)
    flixbus.add(PRAGUE, HAMBURG, monday, 40)

    response = client.get(
        "/bus/trips",
        params=trip_params(
            origin=[BERLIN, HAMBURG], date_to=(FIRST_THURSDAY + timedelta(days=6)).isoformat()
        ),
    )

    assert response.status_code == 200
    [trip] = response.json()
    assert trip["totalPrice"] == 35
    assert (trip["outbound"]["origin"], trip["inbound"]["destination"]) == (HAMBURG, BERLIN)


def test_trip_search_counts_returns_in_the_budget(
    client: TestClient, flixbus: FakeFlixbus, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Two weeks: 2 outbound queries, and as many again for the returns.
    monkeypatch.setattr(bus_service, "MAX_FARE_QUERIES", 3)

    response = client.get("/bus/trips", params=trip_params())

    assert response.status_code == 422
    assert flixbus.searches == []


def test_trip_search_rejects_past_dates(client: TestClient, flixbus: FakeFlixbus) -> None:
    past = date.today() - timedelta(days=7)

    response = client.get("/bus/trips", params=trip_params(date_from=past.isoformat()))

    assert response.status_code == 422
