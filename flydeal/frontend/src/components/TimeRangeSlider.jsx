import React from 'react';

export default function TimeRangeSlider({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label>{label}: {value.earliest_hour}:00 - {value.latest_hour}:00</label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="range"
          min="0"
          max="23"
          value={value.earliest_hour}
          onChange={(e) => onChange({ ...value, earliest_hour: parseInt(e.target.value) })}
        />
        <input
          type="range"
          min="0"
          max="23"
          value={value.latest_hour}
          onChange={(e) => onChange({ ...value, latest_hour: parseInt(e.target.value) })}
        />
      </div>
    </div>
  );
}