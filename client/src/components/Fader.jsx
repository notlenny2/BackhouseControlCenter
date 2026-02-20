import React, { useRef, useCallback, useEffect } from 'react';

// level: 0.0 (silence) → 1.0 (max). Unity (0 dB) = 0.75.
export default function Fader({ level = 0.75, onChange, label, channel, muted = false, onMute, onOpenDetail, vuLevel }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  // VU peak hold — driven by direct DOM manipulation, no React re-renders
  const peakDomRef = useRef(null);
  const peakStateRef = useRef({ level: 0, timerId: null, rafId: null });

  useEffect(() => {
    if (vuLevel === undefined) return;
    const ps = peakStateRef.current;
    const effective = muted ? 0 : vuLevel;

    if (effective >= ps.level) {
      ps.level = effective;
      if (peakDomRef.current) {
        peakDomRef.current.style.bottom = `${levelToK10(ps.level) * 100}%`;
        peakDomRef.current.style.opacity = '1';
      }
      if (ps.timerId) clearTimeout(ps.timerId);
      if (ps.rafId) cancelAnimationFrame(ps.rafId);
      ps.timerId = setTimeout(() => {
        const decay = () => {
          ps.level = Math.max(0, ps.level - 0.003);
          if (peakDomRef.current) {
            peakDomRef.current.style.bottom = `${levelToK10(ps.level) * 100}%`;
            if (ps.level < 0.005) peakDomRef.current.style.opacity = '0';
          }
          if (ps.level > 0.005) ps.rafId = requestAnimationFrame(decay);
        };
        ps.rafId = requestAnimationFrame(decay);
      }, 2500);
    }
  }, [vuLevel, muted]);

  const posToLevel = useCallback((clientY) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return 1 - Math.max(0, Math.min(rect.height, clientY - rect.top)) / rect.height;
  }, []);

  const handleStart = useCallback((clientY) => {
    dragging.current = true;
    onChange?.(posToLevel(clientY));
  }, [posToLevel, onChange]);

  const handleMove = useCallback((clientY) => {
    if (!dragging.current) return;
    onChange?.(posToLevel(clientY));
  }, [posToLevel, onChange]);

  const handleEnd = useCallback(() => { dragging.current = false; }, []);

  const onTouchStart = (e) => { e.preventDefault(); handleStart(e.touches[0].clientY); };
  const onTouchMove  = (e) => { e.preventDefault(); handleMove(e.touches[0].clientY); };
  const onTouchEnd   = () => handleEnd();

  const onMouseDown = (e) => {
    handleStart(e.clientY);
    const mv = (ev) => handleMove(ev.clientY);
    const up = () => { handleEnd(); window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  };

  const percent = (1 - level) * 100;
  const db = level > 0.001 ? Math.round((level - 0.75) * 80) : null;
  const dbLabel = level < 0.01 ? '-∞' : db >= 0 ? `+${db}` : `${db}`;

  const ticks = [
    { pct: 0,   txt: '+10' },
    { pct: 25,  txt: '0',  unity: true },
    { pct: 50,  txt: '-10' },
    { pct: 75,  txt: '-30' },
    { pct: 100, txt: '-∞' },
  ];

  // K-10 mapped position (0–1) drives both the fill top and peak hold
  const vuBarPos = levelToK10(muted ? 0 : (vuLevel ?? 0));
  const vuFillTop = `${(1 - vuBarPos) * 100}%`;

  return (
    <div style={s.wrapper}>
      {/* Channel label */}
      <div style={s.label}>{label || (channel !== undefined ? `Ch${channel}` : '')}</div>

      <div style={s.trackArea}>
        {/* dB scale */}
        <div style={s.scale}>
          {ticks.map(t => (
            <div key={t.pct} style={{ ...s.scaleRow, top: `${t.pct}%` }}>
              <span style={{ ...s.scaleTxt, ...(t.unity ? s.scaleTxtUnity : {}) }}>{t.txt}</span>
              <div style={{ ...s.scaleLine, ...(t.unity ? s.scaleLineUnity : {}) }} />
            </div>
          ))}
        </div>

        {/* Rail + orb */}
        <div style={s.railWrap}>
          <div
            ref={trackRef}
            style={s.rail}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseDown={onMouseDown}
          >
            {/* Fill */}
            <div style={{ ...fillStyle(muted ? 0 : level), height: `${100 - percent}%`, opacity: muted ? 0.25 : 1 }} />
            {/* Unity line */}
            <div style={s.unityLine} />
            {/* Glowing orb thumb */}
            <div style={{ ...orbStyle(muted ? 0 : level), top: `${percent}%`, opacity: muted ? 0.35 : 1 }} />
          </div>

          {/* VU meter bar — always shown on channel strips */}
          {(vuLevel !== undefined || channel !== undefined) && (
            <div style={s.vuTrack}>
              <div style={{ ...s.vuFill, top: vuFillTop }} />
              <div ref={peakDomRef} style={s.vuPeak} />
            </div>
          )}
        </div>
      </div>

      {/* dB readout */}
      <div style={s.dbRow}>
        <span style={s.dbVal}>{dbLabel}</span>
        <span style={s.dbUnit}>dB</span>
      </div>

      {channel !== undefined && <div style={s.chNum}>ch {channel}</div>}

      {/* Mute + Detail buttons */}
      <div style={s.btnRow}>
        <button
          style={{ ...s.muteBtn, ...(muted ? s.muteBtnActive : {}) }}
          onPointerDown={e => { e.stopPropagation(); onMute?.(!muted); }}
        >
          {muted ? 'MUTED' : 'MUTE'}
        </button>
        {onOpenDetail && (
          <button
            style={s.detailBtn}
            onPointerDown={e => { e.stopPropagation(); onOpenDetail(channel); }}
            title="EQ / Comp / Sends"
          >
            ≡
          </button>
        )}
      </div>
    </div>
  );
}

const ORB = 28; // orb diameter px

// K-10 scale: 0 VU = −10 dBFS. Display range: −40 to +10 K-10 (= −50 to 0 dBFS, 50 dB).
// Zones: green 0–80%, yellow 80–88%, red 88–100% of bar height.
function levelToK10(linear) {
  if (linear <= 0) return 0;
  const dBFS = 20 * Math.log10(linear);
  const k = dBFS + 10;                        // shift so −10 dBFS = 0 K-10
  return Math.max(0, Math.min(1, (k + 40) / 50)); // map −40…+10 K-10 → 0…1
}

// Fill glow — matches orb brightness ramp exactly
function fillStyle(level) {
  const t = Math.max(0, level);

  const r1 = Math.round(4  + t * 10);   const a1 = (0.35 + t * 0.55).toFixed(2);
  const r2 = Math.round(8  + t * 22);   const a2 = (0.12 + t * 0.48).toFixed(2);
  const r3 = Math.round(16 + t * 44);   const a3 = (0.03 + t * 0.32).toFixed(2);

  return {
    ...s.fill,
    boxShadow: [
      `0 0 ${r1}px rgba(240,165,0,${a1})`,
      `0 0 ${r2}px rgba(240,165,0,${a2})`,
      `0 0 ${r3}px rgba(240,165,0,${a3})`,
    ].join(', '),
    transition: 'box-shadow 0.06s ease-out',
  };
}

// Glow ramps smoothly from dim (level=0) to blazing (level=1) — no flash
function orbStyle(level) {
  const t = Math.max(0, level); // 0..1

  const r1 = Math.round(4  + t * 14);   const a1 = (0.4 + t * 0.6).toFixed(2);
  const r2 = Math.round(10 + t * 32);   const a2 = (0.2 + t * 0.7).toFixed(2);
  const r3 = Math.round(22 + t * 60);   const a3 = (0.06 + t * 0.54).toFixed(2);
  const r4 = Math.round(40 + t * 110);  const a4 = (0.02 + t * 0.28).toFixed(2);

  return {
    ...s.orb,
    boxShadow: [
      `0 0 ${r1}px rgba(240,165,0,${a1})`,
      `0 0 ${r2}px rgba(240,165,0,${a2})`,
      `0 0 ${r3}px rgba(240,165,0,${a3})`,
      `0 0 ${r4}px rgba(240,165,0,${a4})`,
      'inset 0 1px 3px rgba(255,255,255,0.45)',
    ].join(', '),
    transition: 'box-shadow 0.06s ease-out',
  };
}

const s = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flex: 1,
    minWidth: 44,
    padding: '6px 2px 4px',
    gap: 3,
    background: 'linear-gradient(180deg, #111 0%, #0d0d0d 100%)',
    borderRight: '1px solid #1a1a1a',
    userSelect: 'none',
    touchAction: 'none',
  },
  label: {
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 13,
    color: '#ddd',
    textAlign: 'center',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '0 2px',
    letterSpacing: 0.3,
  },
  trackArea: {
    flex: 1,
    width: '100%',
    display: 'flex',
    gap: 3,
    minHeight: 0,
    padding: '4px 0',
  },
  scale: {
    width: 20,
    position: 'relative',
    flexShrink: 0,
  },
  scaleRow: {
    position: 'absolute',
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    transform: 'translateY(-50%)',
  },
  scaleTxt: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 9,
    color: '#444',
    letterSpacing: 0.2,
    lineHeight: 1,
  },
  scaleTxtUnity: {
    color: '#777',
    fontWeight: 700,
  },
  scaleLine: {
    width: 5,
    height: 1,
    background: '#2a2a2a',
  },
  scaleLineUnity: {
    background: '#555',
    width: 7,
  },
  railWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 3,
    padding: `${ORB / 2}px 0`,
  },
  rail: {
    width: 10,
    height: '100%',
    background: '#111',
    borderRadius: 5,
    border: '1px solid #252525',
    position: 'relative',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 6px rgba(0,0,0,0.9)',
    overflow: 'visible',
    flexShrink: 0,
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, #f0a500, #ffd54f)',
    borderRadius: '0 0 4px 4px',
    pointerEvents: 'none',
  },
  unityLine: {
    position: 'absolute',
    top: '25%',
    left: -5,
    right: -5,
    height: 2,
    background: 'rgba(255,255,255,0.15)',
    pointerEvents: 'none',
    borderRadius: 1,
  },
  orb: {
    position: 'absolute',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: ORB,
    height: ORB,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 38% 32%, #fff7cc, #f0a500 55%, #b36b00)',
    boxShadow: [
      '0 0 6px  rgba(240,165,0,1)',
      '0 0 14px rgba(240,165,0,0.8)',
      '0 0 28px rgba(240,165,0,0.5)',
      '0 0 50px rgba(240,165,0,0.2)',
      'inset 0 1px 2px rgba(255,255,255,0.4)',
    ].join(', '),
    pointerEvents: 'none',
    zIndex: 10,
  },

  // ── VU meter ────────────────────────────────────────────────────────────────
  vuTrack: {
    width: 13,
    height: '100%',
    // Inactive LED zones — K-10 boundaries: green 0–80%, yellow 80–88%, red 88–100%
    background: [
      'linear-gradient(to top,',
      '  #001a08 0%, #001a08 80%,',   // dim green (below reference, −50 to −10 dBFS)
      '  #1a1200 80%, #1a1200 88%,',  // dim yellow (0 to +4 K-10)
      '  #1a0000 88%, #1a0000 100%',  // dim red (+4 to +10 K-10)
      ')',
    ].join(''),
    borderRadius: 4,
    border: '1px solid #2a2a2a',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
  },
  vuFill: {
    // Anchored to bottom — top moves to reveal the correct K-10 zone colors
    position: 'absolute',
    top: '100%',   // default hidden; overridden inline
    bottom: 0,
    left: 0,
    right: 0,
    // Fixed gradient in track coordinates — zones match K-10 scale exactly
    background: [
      'linear-gradient(to top,',
      '  #00b341 0%, #00e676 70%, #00e676 80%,',  // green zone: −50 dBFS → reference (−10 dBFS)
      '  #ffee58 80%, #ffdd00 88%,',               // yellow zone: reference → +4 K-10
      '  #ff6d00 88%, #f44336 100%',               // red zone: +4 → +10 K-10 (0 dBFS)
      ')',
    ].join(''),
    transition: 'top 0.18s ease-out',
  },
  vuPeak: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '0%',
    height: 2,
    background: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
    boxShadow: '0 0 4px rgba(255,255,255,0.5)',
    opacity: 0,
    pointerEvents: 'none',
  },

  // ── Bottom readouts ─────────────────────────────────────────────────────────
  dbRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 2,
  },
  dbVal: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    color: '#f0a500',
    letterSpacing: 0.5,
    fontVariantNumeric: 'tabular-nums',
  },
  dbUnit: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 9,
    color: '#555',
    letterSpacing: 0.5,
  },
  chNum: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 9,
    color: '#3a3a3a',
    letterSpacing: 0.5,
  },
  btnRow: {
    display: 'flex',
    gap: 4,
    width: '100%',
    padding: '0 3px 4px',
    justifyContent: 'center',
  },
  muteBtn: {
    width: 40,
    height: 40,
    flexShrink: 0,
    background: 'linear-gradient(160deg, #2e2e2e 0%, #1a1a1a 60%, #141414 100%)',
    border: '1px solid #3a3a3a',
    borderRadius: 5,
    color: '#555',
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.8,
    padding: 0,
    cursor: 'pointer',
    touchAction: 'none',
    transition: 'all 0.08s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: [
      '0 3px 0 #0a0a0a',
      '0 4px 5px rgba(0,0,0,0.7)',
      'inset 0 1px 0 rgba(255,255,255,0.06)',
    ].join(', '),
  },
  muteBtnActive: {
    background: 'linear-gradient(160deg, #5a0000 0%, #380000 60%, #280000 100%)',
    border: '1px solid #cc2200',
    color: '#ff5533',
    boxShadow: [
      '0 1px 0 #0a0a0a',
      '0 2px 3px rgba(0,0,0,0.7)',
      'inset 0 2px 4px rgba(0,0,0,0.6)',
      '0 0 10px rgba(220,40,0,0.6)',
      '0 0 20px rgba(220,40,0,0.25)',
    ].join(', '),
    transform: 'translateY(2px)',
  },
  detailBtn: {
    width: 40,
    height: 40,
    flexShrink: 0,
    background: 'linear-gradient(160deg, #2a2a2a 0%, #181818 60%, #121212 100%)',
    border: '1px solid #3a3a3a',
    borderRadius: 5,
    color: '#666',
    fontSize: 18,
    lineHeight: 1,
    padding: 0,
    cursor: 'pointer',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: [
      '0 3px 0 #0a0a0a',
      '0 4px 5px rgba(0,0,0,0.7)',
      'inset 0 1px 0 rgba(255,255,255,0.05)',
    ].join(', '),
  },
};
