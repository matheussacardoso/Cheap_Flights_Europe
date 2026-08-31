import React from 'react';

export default function FlightCard({ fare, onBook }) {
  return (
    <div className="glass-panel flight-card">
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{fare.origin} → {fare.destination}</strong>
          <span className="price-tag">€{fare.price}</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          📅 {fare.departure_date} to {fare.return_date}<br />
          ✈️ Airline: {fare.airline}
        </p>
      </div>
      <button 
        className="btn-primary" 
        style={{ marginTop: '1rem', padding: '0.5rem' }}
        onClick={() => onBook(fare.fare_id)}
      >
        Book Deal
      </button>
    </div>
  );
}