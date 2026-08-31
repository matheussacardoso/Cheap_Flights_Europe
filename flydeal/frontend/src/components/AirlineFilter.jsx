import React from 'react';

const AIRLINES = [
  { code: 'FR', name: 'Ryanair' },
  { code: 'U2', name: 'easyJet' },
  { code: 'W6', name: 'Wizz Air' },
  { code: 'VY', name: 'Vueling' },
  { code: 'EW', name: 'Eurowings' },
];

export default function AirlineFilter({ selected, onChange }) {
  const toggleAirline = (code) => {
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  return (
    <div className="form-group">
      <label>Airlines</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {AIRLINES.map((air) => (
          <label key={air.code} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={selected.includes(air.code)}
              onChange={() => toggleAirline(air.code)}
            />
            {air.name}
          </label>
        ))}
      </div>
    </div>
  );
}