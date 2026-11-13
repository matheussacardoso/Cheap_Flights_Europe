from datetime import date, datetime
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from ryanair.types import Flight, Trip

from app.schemas.flight import TripSearchParams

URL = "/flights/trips"
# 2026-12-03 is a Thursday.
THU_TO_MON = {
    "origin": "CGN",
    "destination": "PMI",
    "date_from": "2026-12-01",
    "date_to": "2026-12-20",
    "depart_day": "thursday",
    "return_day": "monday",
}


def make_trip(outbound: date, inbound: date, out_price: float, in_price: float) -> Trip:
    def flight(day: date, origin: str, destination: str, price: float) -> Flight:
        return Flight(
            departureTime=datetime.combine(day, datetime.min.time()).replace(hour=10),
            flightNumber="FR 1234",
            price=price,
            currency="EUR",
            origin=origin,
            originFull=origin,
            destination=destination,
            destinationFull=destination,
        )

    return Trip(
        totalPrice=out_price + in_price,
        outbound=flight(outbound, "CGN", "PMI", out_price),
        inbound=flight(inbound, "PMI", "CGN", in_price),
    )


def params(**overrides) -> TripSearchParams:
    return TripSearchParams.model_validate(THU_TO_MON | {"origin": ["CGN"]} | overrides)


def one_way(day: date, origin: str, destination: str, price: float) -> Flight:
    return Flight(
        departureTime=datetime.combine(day, datetime.min.time()).replace(hour=10),
        flightNumber="FR 1234",
        price=price,
        currency="EUR",
        origin=origin,
        originFull=origin,
        destination=destination,
        destinationFull=destination,
    )


def test_windows_are_every_departure_day_with_its_return_day() -> None:
    assert params().windows() == [
        (date(2026, 12, 3), date(2026, 12, 7)),
        (date(2026, 12, 10), date(2026, 12, 14)),
        (date(2026, 12, 17), date(2026, 12, 21)),
    ]


@pytest.mark.parametrize(
    ("depart", "back", "nights"),
    [
        ("thursday", "monday", 4),
        ("wednesday", "monday", 5),
        ("friday", "sunday", 2),
        ("friday", "friday", 7),
    ],
)
def test_nights_wrap_around_the_week(depart: str, back: str, nights: int) -> None:
    assert params(depart_day=depart, return_day=back).nights == nights


def test_returns_trips_cheapest_first(client: TestClient, ryanair_mock: MagicMock) -> None:
    by_week = {
        date(2026, 12, 3): [make_trip(date(2026, 12, 3), date(2026, 12, 7), 50, 40)],
        date(2026, 12, 10): [make_trip(date(2026, 12, 10), date(2026, 12, 14), 20, 9.99)],
        date(2026, 12, 17): [],
    }
    ryanair_mock.return_value.get_cheapest_return_flights.side_effect = (
        lambda origin, out_from, out_to, in_from, in_to, **kwargs: by_week[out_from]
    )

    response = client.get(URL, params=THU_TO_MON)

    assert response.status_code == 200
    body = response.json()
    assert [trip["totalPrice"] for trip in body] == [29.99, 90]
    assert body[0]["outbound"]["departureTime"] == "2026-12-10T10:00:00"
    assert body[0]["inbound"]["departureTime"] == "2026-12-14T10:00:00"
    assert ryanair_mock.return_value.get_cheapest_return_flights.call_count == 3


def test_queries_each_week_with_exact_dates(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_return_flights.return_value = []

    country = {k: v for k, v in THU_TO_MON.items() if k != "destination"}
    client.get(URL, params=country | {"destination_country": "ES"})

    calls = ryanair_mock.return_value.get_cheapest_return_flights.call_args_list
    first = sorted(calls, key=lambda call: call.args[1])[0]
    assert first.args == (
        "CGN",
        date(2026, 12, 3),
        date(2026, 12, 3),
        date(2026, 12, 7),
        date(2026, 12, 7),
    )
    assert first.kwargs == {"destination_country": "es"}


def test_total_price_is_rounded(client: TestClient, ryanair_mock: MagicMock) -> None:
    trip = make_trip(date(2026, 12, 3), date(2026, 12, 7), 0.1, 0.2)  # 0.30000000000000004
    ryanair_mock.return_value.get_cheapest_return_flights.return_value = [trip]

    response = client.get(URL, params=THU_TO_MON | {"date_to": "2026-12-03"})

    assert response.json()[0]["totalPrice"] == 0.3


@pytest.mark.parametrize(
    "overrides",
    [
        {"depart_day": "thu"},
        {"date_to": "2026-11-30"},
        {"date_to": "2027-04-01"},  # longer than three months
        {"date_from": "2026-12-04", "date_to": "2026-12-09"},  # no Thursday in it
        {"destination_country": "ES"},  # together with destination
    ],
)
def test_invalid_params_return_422(client: TestClient, overrides: dict) -> None:
    assert client.get(URL, params=THU_TO_MON | overrides).status_code == 422


def test_upstream_failure_returns_502(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_return_flights.side_effect = ConnectionError("boom")

    response = client.get(URL, params=THU_TO_MON)

    assert response.status_code == 502
    assert "boom" not in response.text


# --- Several departure airports (open jaw) -------------------------------------------------

OUT, BACK = date(2026, 12, 3), date(2026, 12, 7)
TWO_ORIGINS = THU_TO_MON | {"origin": ["CGN", "NRN"], "date_to": "2026-12-03"}


def fake_one_way_fares(fares: dict[tuple[str, date], list[Flight]]):
    """Stands in for `get_cheapest_flights`: the flights leaving `airport` on that day."""

    def get(airport: str, date_from: date, date_to: date, **kwargs) -> list[Flight]:
        return fares.get((airport, date_from), [])

    return get


def test_origin_can_be_repeated_and_duplicates_are_ignored() -> None:
    assert params(origin=["cgn", "NRN", "CGN"]).origin == ["CGN", "NRN"]


def test_at_most_three_origins(client: TestClient) -> None:
    four = THU_TO_MON | {"origin": ["CGN", "NRN", "EIN", "CRL"]}
    assert client.get(URL, params=four).status_code == 422


def test_return_can_land_at_another_departure_airport(
    client: TestClient, ryanair_mock: MagicMock
) -> None:
    ryanair_mock.return_value.get_cheapest_flights.side_effect = fake_one_way_fares(
        {
            ("CGN", OUT): [one_way(OUT, "CGN", "PMI", 50)],
            ("NRN", OUT): [one_way(OUT, "NRN", "PMI", 30)],  # cheapest way out
            # From Palma: cheapest back is to Cologne; Berlin isn't one of the departures.
            ("PMI", BACK): [
                one_way(BACK, "PMI", "BER", 5),
                one_way(BACK, "PMI", "NRN", 40),
                one_way(BACK, "PMI", "CGN", 20),
            ],
        }
    )

    response = client.get(URL, params=TWO_ORIGINS)

    assert response.status_code == 200
    [trip] = response.json()
    assert (trip["outbound"]["origin"], trip["outbound"]["destination"]) == ("NRN", "PMI")
    assert (trip["inbound"]["origin"], trip["inbound"]["destination"]) == ("PMI", "CGN")
    assert trip["totalPrice"] == 50
    # Round-trip fares can't land elsewhere, so they aren't used with several origins.
    ryanair_mock.return_value.get_cheapest_return_flights.assert_not_called()


def test_no_trip_without_a_way_back(client: TestClient, ryanair_mock: MagicMock) -> None:
    ryanair_mock.return_value.get_cheapest_flights.side_effect = fake_one_way_fares(
        {("CGN", OUT): [one_way(OUT, "CGN", "PMI", 50)]}
    )

    assert client.get(URL, params=TWO_ORIGINS).json() == []


def test_country_search_pairs_each_destination_airport_with_its_own_return(
    client: TestClient, ryanair_mock: MagicMock
) -> None:
    ryanair_mock.return_value.get_cheapest_flights.side_effect = fake_one_way_fares(
        {
            ("CGN", OUT): [one_way(OUT, "CGN", "PMI", 50), one_way(OUT, "CGN", "AGP", 10)],
            ("NRN", OUT): [one_way(OUT, "NRN", "AGP", 20)],
            ("PMI", BACK): [one_way(BACK, "PMI", "CGN", 15)],
            ("AGP", BACK): [one_way(BACK, "AGP", "NRN", 25)],
        }
    )
    country = {k: v for k, v in TWO_ORIGINS.items() if k != "destination"}

    trips = client.get(URL, params=country | {"destination_country": "ES"}).json()

    assert [(t["outbound"]["destination"], t["totalPrice"]) for t in trips] == [
        ("AGP", 35),  # out CGN 10, back to NRN 25
        ("PMI", 65),
    ]
    outbound_calls = [
        call
        for call in ryanair_mock.return_value.get_cheapest_flights.call_args_list
        if call.kwargs["airport"] in ("CGN", "NRN")
    ]
    assert all(call.kwargs["destination_country"] == "es" for call in outbound_calls)
