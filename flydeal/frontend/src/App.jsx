import React, { useState } from 'react';
import './App.css';
import { searchFlights, getBookingLinks } from './api/flightApi';
import SearchPanel from './components/SearchPanel';
import ResultsPanel from './components/ResultsPanel';

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
    airlines: ['FR', 'U2', 'W6', 'VY', 'EW', 'DY'],
    departure_time_range: { earliest_hour: 6, latest_hour: 22 }
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
        <SearchPanel 
          searchParams={searchParams} 
          setSearchParams={setSearchParams} 
          onSearch={handleSearch} 
          loading={loading} 
        />
        <main>
          <ResultsPanel 
            results={results} 
            onBook={handleBook} 
            error={error} 
          />
        </main>
      </div>
    </div>
  );
}