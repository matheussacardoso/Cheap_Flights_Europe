import json
import logging
from datetime import datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.logging import JsonFormatter, request_id_var
from app.main import create_app
from app.schemas.base import CamelModel


def test_docs_enabled_in_development() -> None:
    client = TestClient(create_app(Settings(environment="development")))
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_docs_hidden_in_production() -> None:
    client = TestClient(create_app(Settings(environment="production")))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_base_model_encoders() -> None:
    class Sample(CamelModel):
        unit_price: Decimal
        created_at: datetime

    data = Sample(unit_price=Decimal("9.99"), created_at=datetime(2026, 1, 2, 3, 4)).model_dump(
        mode="json", by_alias=True
    )
    assert data == {"unitPrice": 9.99, "createdAt": "2026-01-02T03:04:00"}


def test_json_log_includes_context() -> None:
    token = request_id_var.set("req-1")
    try:
        record = logging.makeLogRecord(
            {"name": "test", "levelname": "INFO", "msg": "hello", "results": 3}
        )
        record.request_id = request_id_var.get()
        payload = json.loads(JsonFormatter().format(record))
    finally:
        request_id_var.reset(token)

    assert payload["message"] == "hello"
    assert payload["level"] == "INFO"
    assert payload["results"] == 3
    assert payload["request_id"] == "req-1"
