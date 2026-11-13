from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from ryanair.types import Flight

URL = "/flights/cheapest"


def make_flight(**overrides) -> Flight:
    defaults = {
        "departureTime": datetime(2026, 10, 30, 10, 0),
        "flightNumber": "FR1234",
        "price": 19.99,
        "currency": "EUR",
        "origin": "CGN",
        "originFull": "Cologne, Germany",
        "destination": "STN",
        "destinationFull": "London Stansted, United Kingdom",
    }
    return Flight(**(defaults | overrides))


def test_cors_headers(client: TestClient) -> None:
    response = client.options(
        URL,
        headers={"Origin": "http://localhost:4200", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:4200"


def test_get_cheapest_flights_success(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_flights.return_value = [make_flight()]

    response = client.get(URL, params={"origin": "CGN", "date_from": "2026-10-30"})

    assert response.status_code == 200
    assert response.json() == [
        {
            "flightNumber": "FR1234",
            "origin": "CGN",
            "destination": "STN",
            "departureTime": "2026-10-30T10:00:00",
            "price": 19.99,
            "currency": "EUR",
        }
    ]


def test_currency_comes_from_the_provider(client: TestClient, ryanair_mock: MagicMock) -> None:
    """If Ryanair prices in a different currency than requested, report the real one."""
    ryanair_mock.return_value.get_cheapest_flights.return_value = [make_flight(currency="GBP")]

    response = client.get(URL, params={"origin": "STN", "date_from": "2026-10-30"})

    assert response.json()[0]["currency"] == "GBP"


def test_response_has_request_id(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_flights.return_value = []

    sent = client.get(
        URL, params={"origin": "CGN", "date_from": "2026-10-30"}, headers={"X-Request-ID": "abc123"}
    )
    generated = client.get(URL, params={"origin": "CGN", "date_from": "2026-10-30"})

    assert sent.headers["X-Request-ID"] == "abc123"
    assert len(generated.headers["X-Request-ID"]) == 32


def test_params_are_normalized_and_forwarded(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_flights.return_value = []

    response = client.get(
        URL,
        params={
            "origin": "lis",
            "destination": "crl",
            "date_from": "2026-10-30",
            "date_to": "2026-11-05",
            "currency": "gbp",
        },
    )

    assert response.status_code == 200
    ryanair_mock.assert_called_once_with(currency="GBP")
    kwargs = ryanair_mock.return_value.get_cheapest_flights.call_args.kwargs
    assert kwargs["airport"] == "LIS"
    assert kwargs["destination_airport"] == "CRL"
    assert str(kwargs["date_to"]) == "2026-11-05"


def test_date_to_defaults_to_date_from(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_flights.return_value = []

    client.get(URL, params={"origin": "CGN", "date_from": "2026-10-30"})

    kwargs = ryanair_mock.return_value.get_cheapest_flights.call_args.kwargs
    assert kwargs["date_to"] == kwargs["date_from"]
    assert "destination_airport" not in kwargs


def test_missing_params_returns_422(client: TestClient) -> None:
    assert client.get(URL).status_code == 422


@pytest.mark.parametrize(
    "params",
    [
        {"origin": "LISB", "date_from": "2026-10-30"},
        {"origin": "L1S", "date_from": "2026-10-30"},
        {"origin": "LIS", "date_from": "not-a-date"},
        {"origin": "LIS", "date_from": "2026-10-30", "date_to": "2026-10-01"},
        {"origin": "LIS", "date_from": "2026-10-30", "currency": "EURO"},
    ],
)
def test_invalid_params_return_422(client: TestClient, params: dict) -> None:
    assert client.get(URL, params=params).status_code == 422


def test_upstream_failure_returns_502(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_flights.side_effect = ConnectionError("boom")

    response = client.get(URL, params={"origin": "CGN", "date_from": "2026-10-30"})

    assert response.status_code == 502
    assert "boom" not in response.text  # internal errors are not leaked to clients


def test_service_dependency_can_be_overridden(client: TestClient, override_service) -> None:
    fake = MagicMock()
    fake.get_cheapest_flights.return_value = []
    override_service(fake)

    response = client.get(URL, params={"origin": "CGN", "date_from": "2026-10-30"})

    assert response.status_code == 200
    assert response.json() == []
    fake.get_cheapest_flights.assert_called_once()


def test_destination_country_is_forwarded_lowercase(
    client: TestClient, ryanair_mock: MagicMock
) -> None:
    """Ryanair's fare API only matches lowercase country codes."""
    ryanair_mock.return_value.get_cheapest_flights.return_value = []

    response = client.get(
        URL, params={"origin": "LIS", "date_from": "2026-10-30", "destination_country": "ES"}
    )

    assert response.status_code == 200
    kwargs = ryanair_mock.return_value.get_cheapest_flights.call_args.kwargs
    assert kwargs["destination_country"] == "es"
    assert "destination_airport" not in kwargs


@pytest.mark.parametrize(
    "extra",
    [
        {"destination": "AGP", "destination_country": "ES"},
        {"destination_country": "ESP"},
    ],
)
def test_invalid_destination_country_returns_422(client: TestClient, extra: dict) -> None:
    params = {"origin": "LIS", "date_from": "2026-10-30"} | extra
    assert client.get(URL, params=params).status_code == 422


def test_searches_every_departure_airport_cheapest_first(
    client: TestClient, ryanair_mock: MagicMock
) -> None:
    by_origin = {
        "CGN": [make_flight(origin="CGN", price=30)],
        "NRN": [make_flight(origin="NRN", price=10)],
    }
    ryanair_mock.return_value.get_cheapest_flights.side_effect = lambda airport, **kwargs: (
        by_origin[airport]
    )

    response = client.get(URL, params={"origin": ["CGN", "NRN"], "date_from": "2026-10-30"})

    assert [flight["origin"] for flight in response.json()] == ["NRN", "CGN"]
