from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, SerializerFunctionWrapHandler, field_serializer
from pydantic.alias_generators import to_camel


class AppBaseModel(BaseModel):
    """Project-wide base model: shared config and JSON encoders live here."""

    model_config = ConfigDict(
        from_attributes=True,  # build models straight from SDK objects / ORM rows
        str_strip_whitespace=True,
        populate_by_name=True,
    )

    @field_serializer("*", mode="wrap", when_used="json")
    def _encode(self, value: Any, handler: SerializerFunctionWrapHandler) -> Any:
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, datetime):
            return value.isoformat()
        return handler(value)


class CamelModel(AppBaseModel):
    """Base for API responses: snake_case in Python, camelCase in JSON."""

    model_config = ConfigDict(alias_generator=to_camel)
