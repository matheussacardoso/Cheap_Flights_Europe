import React from 'react';
import AirportInput from './AirportInput';
import TimeRangeSlider from './TimeRangeSlider';
import AirlineFilter from './AirlineFilter';

export default function SearchPanel({ searchParams, setSearchParams, onSearch, loading }) {
  return (
    <form className="glass-panel" onSubmit={onSearch}>
      <h3>Search Options</h3>

      <AirportInput 
        label="Origin Airport" 
        value={searchParams.origin} 
        onChange={(val) => setSearchParams({ ...searchParams, origin: val })} 
      />

      <div className="form-group">
        <label>Pattern</label>
        <select 
          value={`${searchParams.day_pattern.depart}-${searchParams.day_pattern.return}`}
          onChange={(e) => {
            const [depart, ret] = e.target.value.split('-');
            setSearchParams({ ...searchParams, day_pattern: { depart, return: ret } });
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
          onChange={(e) => setSearchParams({ ...searchParams, date_from: e.target.value })}
        />
        <input 
          type="date" 
          style={{ marginTop: '0.5rem' }}
          value={searchParams.date_to} 
          onChange={(e) => setSearchParams({ ...searchParams, date_to: e.target.value })}
        />
      </div>

      {searchParams.departure_time_range && (
        <TimeRangeSlider 
          label="Departure Hours" 
          value={searchParams.departure_time_range} 
          onChange={(val) => setSearchParams({ ...searchParams, departure_time_range: val })} 
        />
      )}

      <AirlineFilter 
        selected={searchParams.airlines} 
        onChange={(val) => setSearchParams({ ...searchParams, airlines: val })} 
      />

      <div className="form-group">
        <label>Max Price (€)</label>
        <input 
          type="number" 
          value={searchParams.max_price} 
          onChange={(e) => setSearchParams({ ...searchParams, max_price: parseFloat(e.target.value) })}
        />
      </div>

      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? 'Scanning Deals...' : 'Find Deals'}
      </button>
    </form>
  );
}