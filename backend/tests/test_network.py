import asyncio
from collections.abc import Callable

import httpx
import pytest
from fastapi.testclient import TestClient

from app.services.network_service import NetworkService


def upstream_airport(code: str, country: str, name: str | None = None) -> dict:
    return {
        "code": code,
        "name": name or code.title(),
        "city": {"code": code, "name": f"{code} city"},
        "country": {"code": country, "name": country.upper() + "-land"},
        "coordinates": {"latitude": 38.7, "longitude": -9.1},
        "base": False,
    }


AIRPORTS = [
    upstream_airport("LIS", "pt", "Lisbon"),
    upstream_airport("OPO", "pt", "Porto"),
    upstream_airport("AGP", "es", "Malaga"),
    upstream_airport("RAK", "ma", "Marrakesh"),
]
ROUTES = {
    "LIS": [{"arrivalAirport": upstream_airport("AGP", "es")}],
    "OPO": [
        {"arrivalAirport": upstream_airport("AGP", "es"), "seasonal": True},
        {"arrivalAirport": upstream_airport("RAK", "ma")},
    ],
}


def make_service(
    calls: list[str], handler: Callable[[httpx.Request], httpx.Response] | None = None
) -> NetworkService:
    def default_handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/airports/en/active"):
            return httpx.Response(200, json=AIRPORTS)
        code = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=ROUTES.get(code, []))

    client = httpx.AsyncClient(
        base_url="https://upstream.test", transport=httpx.MockTransport(handler or default_handler)
    )
    return NetworkService(client, ttl_seconds=60)


def test_airports_are_mapped_to_camel_case(client: TestClient, override_network) -> None:
    override_network(make_service([]))

    response = client.get("/network/airports")

    assert response.status_code == 200
    assert response.json()[0] == {
        "code": "LIS",
        "name": "Lisbon",
        "city": "LIS city",
        "countryCode": "PT",
        "countryName": "PT-land",
        "latitude": 38.7,
        "longitude": -9.1,
    }


def test_routes_are_merged_across_the_country_airports(
    client: TestClient, override_network
) -> None:
    override_network(make_service([]))

    response = client.get("/network/routes", params={"origin_country": "pt"})

    assert response.status_code == 200
    assert response.json() == [
        {"origin": "LIS", "destination": "AGP", "seasonal": False},
        {"origin": "OPO", "destination": "AGP", "seasonal": True},
        {"origin": "OPO", "destination": "RAK", "seasonal": False},
    ]


def test_responses_are_cached() -> None:
    calls: list[str] = []
    service = make_service(calls)

    async def run() -> None:
        await service.get_routes_from_country("PT")
        await service.get_routes_from_country("PT")

    asyncio.run(run())

    # 1 airports call + 1 routes call per Portuguese airport, despite two lookups.
    assert len(calls) == 3


def test_unknown_country_returns_no_routes(client: TestClient, override_network) -> None:
    override_network(make_service([]))

    assert client.get("/network/routes", params={"origin_country": "US"}).json() == []


@pytest.mark.parametrize("country", ["PRT", "P1", ""])
def test_invalid_country_returns_422(client: TestClient, country: str) -> None:
    assert client.get("/network/routes", params={"origin_country": country}).status_code == 422


@pytest.mark.parametrize(
    "response",
    [httpx.Response(503), httpx.Response(200, json=[{"unexpected": "shape"}])],
)
def test_upstream_failure_returns_502(
    client: TestClient, override_network, response: httpx.Response
) -> None:
    override_network(make_service([], handler=lambda _: response))

    result = client.get("/network/airports")

    assert result.status_code == 502
    assert result.json() == {"detail": "Failed to fetch route data from the provider"}
