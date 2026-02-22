import { useState, useEffect } from 'react';
import EQCurve from './EQCurve';
import CompressorCurve from './CompressorCurve';

// ─── Slide-in animation ───────────────────────────────────────────────────────
const SLIDE_CSS = `
@keyframes bhp-slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
`;


// ─── Sends tab ────────────────────────────────────────────────────────────────
function SendsTab({ ch, busNames, getSendLevel, setSendLevel }) {
  return (
    <div style={s.sendsGrid}>
      {Array.from({ length: 16 }, (_, i) => i + 1).map(busNum => {
        const level = getSendLevel(ch, busNum);
        const name = busNames[busNum] || `Bus ${busNum}`;
        const pct = Math.round(level * 100);
        return (
          <div key={busNum} style={s.sendRow}>
            <span style={s.sendLabel}>{name}</span>
            <input type="range" min="0" max="1" step="0.001" value={level} style={s.sendSlider}
              onChange={e => setSendLevel(ch, busNum, parseFloat(e.target.value))} />
            <span style={s.sendVal}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────
export default function ChannelDetailPanel({
  channel, channelNames, busNames,
  getEqParam, setEqParam,
  getDynParam, setDynParam,
  getMeterLevel,
  getSendLevel, setSendLevel,
  onClose,
}) {
  const [tab, setTab] = useState('eq');
  const name = channelNames[channel] || `CH ${String(channel).padStart(2, '0')}`;

  useEffect(() => {
    // Inject keyframe CSS once
    if (!document.getElementById('bhp-panel-css')) {
      const el = document.createElement('style');
      el.id = 'bhp-panel-css';
      el.textContent = SLIDE_CSS;
      document.head.appendChild(el);
    }
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      <div style={s.backdrop} onClick={onClose} />

      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.headerSub}>CHANNEL DETAIL</div>
            <div style={s.headerTitle}>{name}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={s.tabBar}>
          {[
            { key: 'eq',    label: 'EQ' },
            { key: 'comp',  label: 'COMP' },
            { key: 'sends', label: 'SENDS' },
          ].map(({ key, label }) => (
            <button
              key={key}
              style={{ ...s.tabBtn, ...(tab === key ? s.tabBtnActive : {}) }}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={s.content}>
          {tab === 'eq' && (
            <div style={s.section}>
              <EQCurve
                ch={channel}
                getEqParam={getEqParam}
                setEqParam={setEqParam}
              />
            </div>
          )}

          {tab === 'comp' && (
            <div style={s.section}>
              <CompressorCurve
                ch={channel}
                getDynParam={getDynParam}
                setDynParam={setDynParam}
                getMeterLevel={getMeterLevel}
              />
            </div>
          )}

          {tab === 'sends' && (
            <div style={s.section}>
              <SendsTab ch={channel} busNames={busNames}
                getSendLevel={getSendLevel} setSendLevel={setSendLevel} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 200,
  },
  panel: {
    position: 'fixed',
    top: 0, right: 0, bottom: 0,
    width: '50vw',
    minWidth: 340,
    background: '#141414',
    borderLeft: '2px solid #2a2a2a',
    zIndex: 201,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'bhp-slide-in 0.22s cubic-bezier(0.22,1,0.36,1) both',
    boxShadow: '-8px 0 40px rgba(0,0,0,0.8)',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 18px',
    borderBottom: '1px solid #222',
    background: '#0e0e0e',
    flexShrink: 0,
  },
  headerSub: {
    color: '#444',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: '#1e1e1e',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#888',
    fontSize: 22,
    width: 52,
    height: 52,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Tab bar
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #222',
    background: '#0e0e0e',
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    color: '#555',
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 2,
    padding: '18px 0',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  tabBtnActive: {
    color: '#00ff88',
    borderBottom: '3px solid #00ff88',
  },

  // Content scroll area
  content: {
    flex: 1,
    overflowY: 'auto',
  },
  section: {
    padding: '20px 24px',
  },

  // ── Sends ───────────────────────────────────────────────────────────────────
  sendsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 16,
    borderBottom: '1px solid #1a1a1a',
  },
  sendLabel: {
    color: '#777',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.5,
    width: 90,
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sendSlider: {
    flex: 1,
    height: 6,
    accentColor: '#ffaa00',
    cursor: 'pointer',
  },
  sendVal: {
    color: '#ffaa00',
    fontSize: 16,
    fontWeight: 700,
    width: 48,
    textAlign: 'right',
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
};
