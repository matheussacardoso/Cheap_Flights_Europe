import React, { useState, useEffect } from 'react';
import { searchAirports } from '../api/flightApi';

export default function AirportInput({ label, value, onChange }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await searchAirports(query);
        setSuggestions(data);
        setIsOpen(true);
      } catch (e) {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (code) => {
    setQuery(code);
    onChange(code);
    setIsOpen(false);
  };

  return (
    <div className="form-group" style={{ position: 'relative' }}>
      <label>{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value.toUpperCase());
          onChange(e.target.value.toUpperCase());
        }}
        placeholder="e.g. LIS, CGN"
        maxLength={3}
      />
      {isOpen && suggestions.length > 0 && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#1e293b', border: '1px solid var(--border)',
          borderRadius: '8px', zIndex: 10, listStyle: 'none', padding: '0.5rem 0', margin: 0
        }}>
          {suggestions.map((item) => (
            <li
              key={item.code}
              onClick={() => handleSelect(item.code)}
              style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
            >
              <strong>{item.code}</strong> — {item.name || item.city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}