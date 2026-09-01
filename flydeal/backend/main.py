from datetime import date
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from ryanair import Ryanair

app = FastAPI(
    title="Ryanair Flight Search API",
    description="FastAPI service to query flight deals via ryanair-py",
    version="1.0.0",
)


class FlightResponse(BaseModel):
    flight_number: str = Field(..., alias="flightNumber")
    origin: str
    destination: str
    departure_time: str = Field(..., alias="departureTime")
    price: float
    currency: str

    class Config:
        populate_by_name = True


@app.get("/flights/cheapest", response_model=List[FlightResponse])
def get_cheapest_flights(
    origin: str = Query(..., description="3-letter IATA code (e.g., LIS)", min_length=3, max_length=3),
    date_from: date = Query(..., description="Start date for search (YYYY-MM-DD)"),
    destination: Optional[str] = Query(None, description="3-letter IATA code (e.g., CRL)", min_length=3, max_length=3),
    date_to: Optional[date] = Query(None, description="End date for search (YYYY-MM-DD)"),
    currency: str = Query("EUR", description="Currency code (e.g., EUR, GBP, USD)"),
):
    """
    Search for the cheapest Ryanair flights based on departure airport and date range.
    """
    try:
        api = Ryanair(currency=currency.upper())

        search_date_to = date_to if date_to else date_from

        kwargs = {
            "airport": origin.upper(),
            "date_from": date_from,
            "date_to": search_date_to,
        }

        if destination:
            kwargs["destination_airport"] = destination.upper()

        flights = api.get_cheapest_flights(**kwargs)

        results = []
        for flight in flights:
            results.append(
                FlightResponse(
                    flightNumber=flight.flightNumber,
                    origin=flight.origin,
                    destination=flight.destination,
                    departureTime=str(flight.departureTime),
                    price=flight.price,
                    currency=currency.upper(),
                )
            )

        return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch flight data: {str(e)}")