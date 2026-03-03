import { useState, useEffect } from 'react';
import EQCurve from './EQCurve';
import CompressorCurve from './CompressorCurve';
import GateCurve from './GateCurve';

const SLIDE_CSS = `
@keyframes bhp-slide-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
`;

export default function BusMasterDetailPanel({
  bus,
  busNames,
  getBusEqParam,
  setBusEqParam,
  getBusDynParam,
  setBusDynParam,
  getBusGateParam,
  setBusGateParam,
  getMeterLevel,
  onClose,
}) {
  const [tab, setTab] = useState('eq');
  const name = busNames[bus] || `Bus ${String(bus).padStart(2, '0')}`;

  useEffect(() => {
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
        <div style={s.header}>
          <div>
            <div style={s.headerSub}>BUS MASTER DETAIL</div>
            <div style={s.headerTitle}>{name}</div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.tabBar}>
          {[
            { key: 'eq', label: 'EQ' },
            { key: 'comp', label: 'COMP' },
            { key: 'gate', label: 'GATE' },
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

        <div style={s.content}>
          {tab === 'eq' && (
            <div style={s.section}>
              <EQCurve ch={bus} getEqParam={getBusEqParam} setEqParam={setBusEqParam} />
            </div>
          )}
          {tab === 'comp' && (
            <div style={s.section}>
              <CompressorCurve ch={bus} getDynParam={getBusDynParam} setDynParam={setBusDynParam} getMeterLevel={getMeterLevel} />
            </div>
          )}
          {tab === 'gate' && (
            <div style={s.section}>
              <GateCurve ch={bus} getGateParam={getBusGateParam} setGateParam={setBusGateParam} getMeterLevel={getMeterLevel} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

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
  content: {
    flex: 1,
    overflowY: 'auto',
  },
  section: {
    padding: '20px 24px',
  },
};
