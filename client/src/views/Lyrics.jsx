import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

export default function Lyrics({ isAdmin }) {
  const { emit, on } = useSocket();
  const [songs, setSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [fontSize, setFontSize] = useState(28);

  // Load available lyrics on mount
  useEffect(() => {
    fetch('/api/lyrics')
      .then(r => r.json())
      .then(setSongs)
      .catch(() => {});
  }, []);

  // Listen for admin-pushed lyrics
  useEffect(() => {
    const off = on('lyrics:current', ({ song, sectionIndex }) => {
      if (!isAdmin) {
        setCurrentSong(song);
        setCurrentSectionIndex(sectionIndex);
      }
    });
    return off;
  }, [on, isAdmin]);

  const loadSong = async (name) => {
    const res = await fetch(`/api/lyrics/${name}`);
    const data = await res.json();
    setCurrentSong(data);
    setCurrentSectionIndex(0);
  };

  const goToSection = (index) => {
    setCurrentSectionIndex(index);
    if (isAdmin && currentSong) {
      emit('lyrics:broadcast', { song: currentSong, sectionIndex: index });
    }
  };

  const section = currentSong?.sections?.[currentSectionIndex];

  return (
    <div style={styles.container}>
      {isAdmin && (
        <div style={styles.controls}>
          <select
            value={currentSong?.title || ''}
            onChange={(e) => loadSong(e.target.value)}
            style={styles.songSelect}
          >
            <option value="">— Select Song —</option>
            {songs.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div style={styles.sizeControls}>
            <button onClick={() => setFontSize(f => Math.max(16, f - 4))} style={styles.sizeBtn}>A−</button>
            <button onClick={() => setFontSize(f => Math.min(72, f + 4))} style={styles.sizeBtn}>A+</button>
          </div>
        </div>
      )}

      {currentSong && (
        <>
          <div style={styles.songTitle}>{currentSong.title}</div>
          <div style={styles.sectionNav}>
            {currentSong.sections?.map((sec, i) => (
              <button
                key={i}
                onClick={() => goToSection(i)}
                style={{
                  ...styles.sectionBtn,
                  ...(i === currentSectionIndex ? styles.sectionBtnActive : {}),
                }}
              >
                {sec.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={styles.lyricsDisplay}>
        {section ? (
          <>
            <div style={styles.sectionLabel}>{section.label}</div>
            <div style={styles.lines}>
              {section.lines.map((line, i) => (
                <div key={i} style={{ ...styles.line, fontSize }}>
                  {line}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={styles.placeholder}>
            {isAdmin ? 'Select a song to display lyrics' : 'Waiting for lyrics...'}
          </div>
        )}
      </div>

      {currentSong && (
        <div style={styles.navButtons}>
          <button
            onClick={() => goToSection(Math.max(0, currentSectionIndex - 1))}
            disabled={currentSectionIndex === 0}
            style={styles.navBtn}
          >
            ← Prev
          </button>
          <span style={styles.sectionCount}>
            {currentSectionIndex + 1} / {currentSong.sections?.length || 0}
          </span>
          <button
            onClick={() => goToSection(Math.min((currentSong.sections?.length || 1) - 1, currentSectionIndex + 1))}
            disabled={currentSectionIndex >= (currentSong.sections?.length || 1) - 1}
            style={styles.navBtn}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    background: '#0d0d0d',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: '#111',
    borderBottom: '1px solid #222',
  },
  songSelect: {
    flex: 1,
    fontSize: 14,
    padding: '8px 10px',
    minHeight: 40,
  },
  sizeControls: {
    display: 'flex',
    gap: 4,
  },
  sizeBtn: {
    background: '#222',
    color: '#ccc',
    fontSize: 13,
    padding: '6px 12px',
    borderRadius: 6,
    minHeight: 36,
  },
  songTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#f0a500',
    padding: '10px 16px 4px',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionNav: {
    display: 'flex',
    gap: 6,
    padding: '4px 12px 8px',
    overflowX: 'auto',
    flexShrink: 0,
  },
  sectionBtn: {
    background: '#1a1a1a',
    color: '#888',
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
    minHeight: 32,
    border: '1px solid #2a2a2a',
  },
  sectionBtnActive: {
    background: '#f0a500',
    color: '#000',
    border: '1px solid #f0a500',
    fontWeight: 700,
  },
  lyricsDisplay: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    color: '#555',
    marginBottom: 16,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  lines: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  line: {
    color: '#fff',
    lineHeight: 1.4,
    fontWeight: 500,
  },
  placeholder: {
    color: '#444',
    textAlign: 'center',
    fontSize: 18,
    margin: 'auto',
  },
  navButtons: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderTop: '1px solid #1a1a1a',
    background: '#0d0d0d',
  },
  navBtn: {
    background: '#1a1a1a',
    color: '#ccc',
    fontSize: 15,
    fontWeight: 600,
    padding: '10px 20px',
    borderRadius: 8,
    minHeight: 44,
    border: '1px solid #2a2a2a',
  },
  sectionCount: {
    color: '#555',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  },
};
