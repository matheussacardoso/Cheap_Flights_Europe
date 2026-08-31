import React, { useState } from 'react';
import './App.css';
import { searchFlights, getBookingLinks } from './api/flightApi';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const [searchParams, setSearchParams] = useState({
    origin: 'CGN',
    destinations: ['BCN', 'AGP', 'PMI', 'LIS'],
    date_from: '2026-10-01',
    date_to: '2026-12-31',
    day_pattern: { depart: 'thursday', return: 'monday' },
    direct_only: true,
    max_price: 150,
    airlines: ['FR', 'U2', 'W6', 'VY', 'EW', 'DY']
  });

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await searchFlights(searchParams);
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (fareId) => {
    try {
      const data = await getBookingLinks(fareId);
      if (data.url) window.open(data.url, '_blank');
    } catch (err) {
      alert('Unable to fetch booking link.');
    }
  };

  return (
    <div className="app-container">
      <header>
        ✈️ <h1>FlyDeal</h1>
      </header>

      <div className="layout-grid">
        <form className="glass-panel" onSubmit={handleSearch}>
          <h3>Search Options</h3>
          
          <div className="form-group">
            <label>Origin Airport (IATA)</label>
            <input 
              value={searchParams.origin} 
              onChange={e => setSearchParams({...searchParams, origin: e.target.value.toUpperCase()})}
              maxLength={3}
            />
          </div>

          <div className="form-group">
            <label>Pattern</label>
            <select 
              value={`${searchParams.day_pattern.depart}-${searchParams.day_pattern.return}`}
              onChange={e => {
                const [depart, ret] = e.target.value.split('-');
                setSearchParams({...searchParams, day_pattern: { depart, return: ret }});
              }}
            >
              <option value="thursday-monday">Thu → Mon</option>
              <option value="friday-sunday">Fri → Sun</option>
              <option value="friday-tuesday">Fri → Tue</option>
            </select>
          </div>

          <div className="form-group">
            <label>Date Window</label>
            <input 
              type="date" 
              value={searchParams.date_from} 
              onChange={e => setSearchParams({...searchParams, date_from: e.target.value})}
            />
            <input 
              type="date" 
              style={{marginTop: '0.5rem'}}
              value={searchParams.date_to} 
              onChange={e => setSearchParams({...searchParams, date_to: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Max Price (€)</label>
            <input 
              type="number" 
              value={searchParams.max_price} 
              onChange={e => setSearchParams({...searchParams, max_price: parseFloat(e.target.value)})}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Scanning Deals...' : 'Find Deals'}
          </button>
        </form>

        <main>
          {error && <div className="glass-panel" style={{color: '#ef4444'}}>{error}</div>}
          
          <div className="flight-grid">
            {results.map((fare, idx) => (
              <div key={idx} className="glass-panel flight-card">
                <div>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <strong>{fare.origin} → {fare.destination}</strong>
                    <span className="price-tag">€{fare.price}</span>
                  </div>
                  <p style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>
                    📅 {fare.departure_date} to {fare.return_date}<br/>
                    ✈️ Airline: {fare.airline}
                  </p>
                </div>
                <button 
                  className="btn-primary" 
                  style={{marginTop: '1rem', padding: '0.5rem'}}
                  onClick={() => handleBook(fare.fare_id)}
                >
                  Book Deal
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}