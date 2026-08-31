import React from 'react';
import FlightCard from './FlightCard';

export default function ResultsPanel({ results, onBook, error }) {
  if (error) {
    return <div className="glass-panel" style={{ color: '#ef4444' }}>{error}</div>;
  }

  if (!results.length) {
    return <div className="glass-panel" style={{ color: 'var(--text-muted)' }}>No flight deals found yet. Run a search to see options!</div>;
  }

  return (
    <div className="flight-grid">
      {results.map((fare, idx) => (
        <FlightCard key={fare.fare_id || idx} fare={fare} onBook={onBook} />
      ))}
    </div>
  );
}