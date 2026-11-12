from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_flight_service, get_network_service
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def ryanair_mock(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace the Ryanair SDK class used by the service."""
    mock = MagicMock()
    monkeypatch.setattr("app.services.flight_service.Ryanair", mock)
    return mock


@pytest.fixture
def override_service():
    """Swap the FlightService dependency for a fake one."""

    def _override(fake) -> None:
        app.dependency_overrides[get_flight_service] = lambda: fake

    return _override


@pytest.fixture
def override_network():
    """Swap the NetworkService dependency for a fake one."""

    def _override(fake) -> None:
        app.dependency_overrides[get_network_service] = lambda: fake

    return _override
