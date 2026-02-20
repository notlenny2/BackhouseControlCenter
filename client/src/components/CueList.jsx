import React from 'react';

const CUE_TYPE_COLORS = {
  pc: '#2196f3',
  cc: '#9c27b0',
  note: '#4caf50',
};

export default function CueList({ cues = [], firedCues = [], currentBar, currentBeat, onFire, onEdit, onAdd, onDelete }) {
  const nextCue = cues.find(c => !firedCues.includes(c.id));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Cue List</span>
        {onAdd && (
          <button onClick={onAdd} style={styles.addBtn}>+ Add Cue</button>
        )}
      </div>
      <div style={styles.list}>
        {cues.map((cue) => {
          const fired = firedCues.includes(cue.id);
          const isNext = nextCue?.id === cue.id;
          const isPast = fired;
          const typeColor = cue.midi ? CUE_TYPE_COLORS[cue.midi.type] || '#888' : '#888';

          return (
            <div
              key={cue.id}
              style={{
                ...styles.cue,
                ...(isNext ? styles.cueNext : {}),
                ...(isPast ? styles.cueFired : {}),
              }}
            >
              <div style={styles.cuePosition}>
                <span style={styles.bar}>{cue.bar}</span>
                <span style={styles.beatDot}>:{cue.beat}</span>
              </div>
              <div style={styles.cueInfo}>
                <div style={styles.cueLabel}>{cue.label}</div>
                {cue.song && <div style={styles.cueSong}>{cue.song}</div>}
                {cue.midi && (
                  <div style={{ ...styles.cueMidi, color: typeColor }}>
                    {formatMidi(cue.midi)}
                  </div>
                )}
              </div>
              <div style={styles.cueActions}>
                {isNext && <span style={styles.nextBadge}>NEXT</span>}
                {fired && <span style={styles.firedBadge}>✓</span>}
                {onFire && (
                  <button onClick={() => onFire(cue.id)} style={styles.fireBtn} title="Fire now">
                    ▶
                  </button>
                )}
                {onEdit && (
                  <button onClick={() => onEdit(cue)} style={styles.editBtn} title="Edit">
                    ✎
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(cue.id)} style={styles.deleteBtn} title="Delete">
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {cues.length === 0 && (
          <div style={styles.empty}>No cues. Load a show or add cues manually.</div>
        )}
      </div>
    </div>
  );
}

function formatMidi(m) {
  switch (m.type) {
    case 'pc': return `PC ch${m.channel} → prog ${m.value}`;
    case 'cc': return `CC ch${m.channel} cc${m.cc} = ${m.value}`;
    case 'note': return `Note On ch${m.channel} note ${m.note} vel ${m.velocity || 100}`;
    default: return JSON.stringify(m);
  }
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    background: '#141414',
    borderRadius: 8,
    border: '1px solid #2a2a2a',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #2a2a2a',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#888',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  addBtn: {
    background: '#252525',
    color: '#f0a500',
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 6,
    minHeight: 30,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
  },
  cue: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderBottom: '1px solid #1e1e1e',
    transition: 'background 0.2s',
  },
  cueNext: {
    background: 'rgba(240,165,0,0.08)',
    borderLeft: '3px solid #f0a500',
  },
  cueFired: {
    opacity: 0.45,
  },
  cuePosition: {
    minWidth: 44,
    textAlign: 'right',
  },
  bar: {
    fontSize: 18,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: '#fff',
  },
  beatDot: {
    fontSize: 14,
    color: '#666',
  },
  cueInfo: {
    flex: 1,
    minWidth: 0,
  },
  cueLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#eee',
  },
  cueSong: {
    fontSize: 11,
    color: '#666',
    marginTop: 1,
  },
  cueMidi: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  cueActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  nextBadge: {
    fontSize: 9,
    fontWeight: 700,
    color: '#f0a500',
    letterSpacing: 0.5,
    padding: '2px 5px',
    background: 'rgba(240,165,0,0.15)',
    borderRadius: 4,
  },
  firedBadge: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: 700,
  },
  fireBtn: {
    background: '#333',
    color: '#f0a500',
    fontSize: 14,
    padding: '4px 8px',
    borderRadius: 6,
    minHeight: 32,
    minWidth: 32,
  },
  editBtn: {
    background: '#252525',
    color: '#888',
    fontSize: 14,
    padding: '4px 8px',
    borderRadius: 6,
    minHeight: 32,
    minWidth: 32,
  },
  deleteBtn: {
    background: '#252525',
    color: '#f44336',
    fontSize: 18,
    padding: '2px 8px',
    borderRadius: 6,
    minHeight: 32,
    minWidth: 32,
  },
  empty: {
    color: '#444',
    textAlign: 'center',
    padding: '32px 16px',
    fontSize: 14,
  },
};
