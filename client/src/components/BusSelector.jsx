import React from 'react';

const BUSES = Array.from({ length: 16 }, (_, i) => i + 1);

export default function BusSelector({ value, onChange, busNames = {} }) {
  return (
    <div style={styles.wrapper}>
      <span style={styles.label}>Monitor Bus:</span>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={styles.select}
      >
        {BUSES.map(b => {
          const name = busNames[b];
          return (
            <option key={b} value={b}>
              {name ? `${name} (Bus ${b})` : `Bus ${b}`}
            </option>
          );
        })}
      </select>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  label: {
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 18,
    color: '#999',
    whiteSpace: 'nowrap',
  },
  select: {
    flex: 1,
    maxWidth: 160,
    fontSize: 18,
    padding: '6px 10px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#f0f0f0',
    minHeight: 36,
  },
};
