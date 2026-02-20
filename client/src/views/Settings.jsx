import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

const SOURCES = [
  { icon: '🎥', label: 'USB / Webcam',    desc: 'Add as Video Capture Device in OBS' },
  { icon: '📥', label: 'HDMI Capture',    desc: 'PCIe or USB capture card → Video Capture Device' },
  { icon: '🌐', label: 'NDI',             desc: 'Install OBS-NDI plugin, add as NDI Source' },
  { icon: '📡', label: 'IP / RTSP',       desc: 'Add as Media Source with rtsp:// URL' },
  { icon: '💻', label: 'Screen Capture',  desc: 'Add as Display Capture in OBS' },
  { icon: '📱', label: 'Phone / Tablet',  desc: 'NDI app (iOS/Android), Camo, or DroidCam' },
];

export default function Settings() {
  const { emit, on, connected } = useSocket();

  const [x32Ip, setX32Ip]           = useState('');
  const [obsHost, setObsHost]         = useState('localhost');
  const [obsPort, setObsPort]         = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [midiPortIndex, setMidiPortIndex] = useState(0);
  const [midiPorts, setMidiPorts]     = useState([]);

  const [x32Status, setX32Status]   = useState({ connected: false });
  const [obsStatus, setObsStatus]   = useState({ connected: false });
  const [midiStatus, setMidiStatus] = useState({ portName: null });

  const [saving, setSaving] = useState(null); // 'x32'|'obs'|'midi'
  const [saved,  setSaved]  = useState(null);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    if (connected) emit('settings:get');
  }, [connected, emit]);

  useEffect(() => {
    const offs = [
      on('settings:data', (d) => {
        setX32Ip(d.x32Ip || '');
        setObsHost(d.obsHost || 'localhost');
        setObsPort(String(d.obsPort || 4455));
        setMidiPortIndex(d.midiPortIndex ?? 0);
        setMidiPorts(d.midiPorts || []);
      }),
      on('settings:saved', ({ section }) => {
        setSaving(null);
        setSaved(section);
        setError(null);
        setTimeout(() => setSaved(null), 2200);
      }),
      on('settings:error', ({ section, error: err }) => {
        setSaving(null);
        setError({ section, msg: err });
        setTimeout(() => setError(null), 4000);
      }),
      on('x32:status',  setX32Status),
      on('obs:status',  setObsStatus),
      on('midi:status', setMidiStatus),
    ];
    return () => offs.forEach(o => o());
  }, [on]);

  const applyX32 = () => {
    setSaving('x32'); setError(null);
    emit('settings:save', { section: 'x32', x32Ip: x32Ip.trim() });
  };

  const applyObs = () => {
    setSaving('obs'); setError(null);
    emit('settings:save', {
      section: 'obs',
      obsHost: obsHost.trim(),
      obsPort: parseInt(obsPort) || 4455,
      obsPassword,
    });
  };

  const applyMidi = () => {
    setSaving('midi'); setError(null);
    emit('settings:save', { section: 'midi', midiPortIndex });
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.headerTitle}>SERVER SETTINGS</span>
      </div>

      <div style={s.body}>

        {/* ── X32 ── */}
        <Section title="BEHRINGER X32" status={x32Status.connected}
          statusLabel={x32Status.connected ? `Connected · ${x32Status.ip || x32Ip}` : 'Not connected'}
        >
          <div style={s.fieldRow}>
            <input
              value={x32Ip}
              onChange={e => setX32Ip(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyX32()}
              placeholder="192.168.x.x"
              style={s.input}
            />
            <ApplyBtn saving={saving === 'x32'} saved={saved === 'x32'} onClick={applyX32} />
          </div>
          {error?.section === 'x32' && <div style={s.errorMsg}>{error.msg}</div>}
          <div style={s.hint}>OSC UDP · port 10023</div>
        </Section>

        {/* ── OBS ── */}
        <Section title="OBS WEBSOCKET" status={obsStatus.connected}
          statusLabel={obsStatus.connected ? `Connected · ${obsHost}:${obsPort}` : 'Not connected'}
        >
          <div style={s.fieldRow}>
            <input
              value={obsHost}
              onChange={e => setObsHost(e.target.value)}
              placeholder="Host IP or hostname"
              style={{ ...s.input, flex: 2 }}
            />
            <input
              value={obsPort}
              onChange={e => setObsPort(e.target.value)}
              placeholder="4455"
              style={{ ...s.input, width: 72, flex: 'none' }}
              type="number"
            />
          </div>
          <div style={s.fieldRow}>
            <input
              value={obsPassword}
              onChange={e => setObsPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyObs()}
              placeholder="Password (leave blank if none)"
              type="password"
              style={s.input}
            />
            <ApplyBtn saving={saving === 'obs'} saved={saved === 'obs'} onClick={applyObs} label="Connect" />
          </div>
          {error?.section === 'obs' && <div style={s.errorMsg}>{error.msg}</div>}
          <div style={s.hint}>Tools → WebSocket Server Settings in OBS · WebSocket v5</div>
        </Section>

        {/* ── MIDI ── */}
        <Section title="MIDI OUTPUT"
          statusLabel={midiStatus.portName || 'No port open'}
          statusColor={midiStatus.portName ? '#f0a500' : '#444'}
        >
          {midiPorts.length === 0 ? (
            <div style={s.hint}>No MIDI ports detected on this machine</div>
          ) : (
            <div style={s.fieldRow}>
              <select
                value={midiPortIndex}
                onChange={e => setMidiPortIndex(parseInt(e.target.value))}
                style={s.select}
              >
                {midiPorts.map(p => (
                  <option key={p.index} value={p.index}>{p.name}</option>
                ))}
              </select>
              <ApplyBtn saving={saving === 'midi'} saved={saved === 'midi'} onClick={applyMidi} />
            </div>
          )}
          {error?.section === 'midi' && <div style={s.errorMsg}>{error.msg}</div>}
          <div style={s.hint}>Sends Program Change, CC, and Note messages from the timeline</div>
        </Section>

        {/* ── Camera sources reference ── */}
        <Section title="CAMERA SOURCES" noStatus>
          <div style={s.sourceGrid}>
            {SOURCES.map(src => (
              <div key={src.label} style={s.sourceCard}>
                <span style={s.sourceIcon}>{src.icon}</span>
                <div>
                  <div style={s.sourceLabel}>{src.label}</div>
                  <div style={s.sourceDesc}>{src.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={s.hint}>
            Configure all sources in OBS — they appear automatically as scenes in the Stream tab.
            On the gaming PC, use NVENC hardware encoding (Settings → Output → NVLA H.264 NVENC).
          </div>
        </Section>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, status, statusLabel, statusColor, noStatus, children }) {
  const dotColor = statusColor || (status ? '#00e676' : '#f44336');
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{title}</span>
        {!noStatus && (
          <div style={s.statusPill}>
            <div style={{ ...s.dot, background: dotColor, boxShadow: status ? `0 0 5px ${dotColor}` : 'none' }} />
            <span style={{ ...s.statusLabel, color: status || statusColor ? dotColor : '#444' }}>
              {statusLabel}
            </span>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ApplyBtn({ saving, saved, onClick, label = 'Apply' }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{ ...s.applyBtn, ...(saved ? s.applyBtnSaved : {}) }}
    >
      {saved ? '✓' : saving ? '…' : label}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    background: '#080808',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 14px',
    background: 'linear-gradient(90deg, #0d0d0d, #111)',
    borderBottom: '1px solid #1f1f1f',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    color: '#f0a500',
    letterSpacing: 2,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 12px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    background: '#0f0f0f',
    border: '1px solid #1c1c1c',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardTitle: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: '#f0a500',
    letterSpacing: 1.5,
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.3s, box-shadow 0.3s',
  },
  statusLabel: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  fieldRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: '9px 11px',
    background: '#1a1a1a',
    border: '1px solid #272727',
    borderRadius: 8,
    color: '#f0f0f0',
    minHeight: 42,
    fontFamily: "'BHP-Mono', monospace",
  },
  select: {
    flex: 1,
    fontSize: 14,
    padding: '9px 11px',
    background: '#1a1a1a',
    border: '1px solid #272727',
    borderRadius: 8,
    color: '#f0f0f0',
    minHeight: 42,
  },
  applyBtn: {
    background: 'rgba(240,165,0,0.12)',
    color: '#f0a500',
    fontSize: 13,
    fontWeight: 700,
    padding: '9px 16px',
    borderRadius: 8,
    border: '1px solid rgba(240,165,0,0.25)',
    minHeight: 42,
    minWidth: 72,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  applyBtnSaved: {
    color: '#00e676',
    borderColor: 'rgba(0,230,118,0.3)',
    background: 'rgba(0,230,118,0.08)',
  },
  hint: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    color: '#3a3a3a',
    letterSpacing: 0.3,
    lineHeight: 1.5,
  },
  errorMsg: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    color: '#f44336',
    letterSpacing: 0.3,
  },
  sourceGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sourceCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 10px',
    background: '#141414',
    borderRadius: 8,
    border: '1px solid #1e1e1e',
  },
  sourceIcon: {
    fontSize: 20,
    lineHeight: 1,
    flexShrink: 0,
    marginTop: 1,
  },
  sourceLabel: {
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 14,
    color: '#ccc',
    marginBottom: 2,
  },
  sourceDesc: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    color: '#444',
    letterSpacing: 0.2,
    lineHeight: 1.4,
  },
};
