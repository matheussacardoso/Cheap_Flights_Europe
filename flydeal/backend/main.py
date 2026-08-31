import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import SearchRequest, BookingLinkRequest
from flight_search import IgnavClient

load_dotenv()

app = FastAPI(title="FlyDeal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ignav_client = IgnavClient()

@app.get("/api/airports")
async def get_airports(q: str = Query(..., min_length=1)):
    return await ignav_client.search_airports(q)

@app.post("/api/search")
async def search_flights(request: SearchRequest):
    if not os.getenv("IGNAV_API_KEY"):
        raise HTTPException(status_code=500, detail="IGNAV_API_KEY environment variable is not configured.")
    return await ignav_client.batch_search(request)

@app.post("/api/booking-links")
async def get_booking_links(request: BookingLinkRequest):
    return await ignav_client.get_booking_link(request.fare_id)