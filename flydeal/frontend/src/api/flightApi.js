const API_BASE = 'http://localhost:8000/api';

export async function searchAirports(query) {
  const res = await fetch(`${API_BASE}/airports?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function searchFlights(searchParams) {
  const res = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchParams),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to search flights');
  }
  return res.json();
}

export async function getBookingLinks(fareId) {
  const res = await fetch(`${API_BASE}/booking-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fare_id: fareId }),
  });
  return res.json();
}