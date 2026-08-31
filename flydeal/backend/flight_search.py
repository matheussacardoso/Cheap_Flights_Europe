import os
import httpx
import asyncio
from typing import List, Dict, Any
from models import SearchRequest, BookingLinkRequest
from date_patterns import generate_date_pairs

IGNAV_BASE_URL = "https://ignav.com/api"

class IgnavClient:
    def __init__(self):
        self.api_key = os.getenv("IGNAV_API_KEY", "")
        self.headers = {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json"
        }

    async def search_airports(self, query: str) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{IGNAV_BASE_URL}/airports", params={"q": query}, headers=self.headers)
            return res.json() if res.status_code == 200 else []

    async def search_single_pair(self, client: httpx.AsyncClient, origin: str, destination: str, depart_date: str, return_date: str, request: SearchRequest) -> List[Dict[str, Any]]:
        payload = {
            "origin": origin,
            "destination": destination,
            "departure_date": depart_date,
            "return_date": return_date,
            "max_stops": 0 if request.direct_only else None,
            "max_price": request.max_price,
            "airlines_include": request.airlines
        }

        if request.departure_time_range:
            payload["departure_time_range"] = request.departure_time_range.model_dump()
        if request.return_time_range:
            payload["return_time_range"] = request.return_time_range.model_dump()

        try:
            res = await client.post(f"{IGNAV_BASE_URL}/fares/round-trip", json=payload, headers=self.headers, timeout=10.0)
            if res.status_code == 200:
                return res.json().get("fares", [])
        except Exception:
            pass
        return []

    async def batch_search(self, request: SearchRequest) -> List[Dict[str, Any]]:
        date_pairs = generate_date_pairs(
            request.date_from, 
            request.date_to, 
            request.day_pattern.depart, 
            request.day_pattern.return_day
        )

        all_fares = []
        async with httpx.AsyncClient() as client:
            tasks = []
            for dest in request.destinations:
                for dep_date, ret_date in date_pairs:
                    tasks.append(self.search_single_pair(client, request.origin, dest, dep_date, ret_date, request))
            
            results = await asyncio.gather(*tasks)
            for fare_list in results:
                all_fares.extend(fare_list)

        # Sort results by price ascending
        all_fares.sort(key=lambda x: x.get("price", float("inf")))
        return all_fares

    async def get_booking_link(self, fare_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{IGNAV_BASE_URL}/fares/booking-links", json={"fare_id": fare_id}, headers=self.headers)
            return res.json() if res.status_code == 200 else {}