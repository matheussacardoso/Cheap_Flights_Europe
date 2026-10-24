from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# Create mock objects with dot-accessible attributes matching the Ryanair SDK output
mock_flight = MagicMock()
mock_flight.flightNumber = "FR1234"
mock_flight.origin = "CGN"
mock_flight.destination = "STN"
mock_flight.departureTime = "2026-10-30T10:00:00"
mock_flight.price = 19.99

MOCK_FLIGHT_DATA = [mock_flight]

def test_cors_headers():
    """Garante que as origens permitidas (CORS) respondem com os cabeçalhos corretos."""
    response = client.options(
        "/flights/cheapest",
        headers={
            "Origin": "http://localhost:4200",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:4200"

@patch("main.Ryanair")
def test_get_cheapest_flights_success(mock_ryanair):
    mock_instance = mock_ryanair.return_value
    mock_instance.get_cheapest_flights.return_value = MOCK_FLIGHT_DATA

    response = client.get("/flights/cheapest?origin=CGN&date_from=2026-10-30")

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

def test_get_cheapest_flights_missing_params():
    """Garante erro HTTP 422 se os parâmetros obrigatórios forem omitidos."""
    response = client.get("/flights/cheapest")
    assert response.status_code == 422