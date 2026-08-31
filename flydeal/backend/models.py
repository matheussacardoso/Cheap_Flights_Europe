from pydantic import BaseModel, Field
from typing import List, Optional

class DayPattern(BaseModel):
    depart: str  # e.g., "thursday"
    return_day: str = Field(..., alias="return")  # e.g., "monday"

    class Config:
        populate_by_name = True

class TimeRange(BaseModel):
    earliest_hour: int = Field(0, ge=0, le=23)
    latest_hour: int = Field(23, ge=0, le=23)

class SearchRequest(BaseModel):
    origin: str  # IATA Code
    destinations: List[str]  # List of IATA Codes
    date_from: str  # YYYY-MM-DD
    date_to: str    # YYYY-MM-DD
    day_pattern: DayPattern
    direct_only: bool = True
    departure_time_range: Optional[TimeRange] = None
    return_time_range: Optional[TimeRange] = None
    max_price: Optional[float] = None
    airlines: Optional[List[str]] = Field(default_factory=lambda: ["FR", "U2", "W6", "VY", "EW", "DY"])

class BookingLinkRequest(BaseModel):
    fare_id: str