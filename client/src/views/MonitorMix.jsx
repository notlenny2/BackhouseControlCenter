import React, { useState, useEffect } from 'react';
import FaderGroup from '../components/FaderGroup';
import Fader from '../components/Fader';
import ChannelDetailPanel from '../components/ChannelDetailPanel';
import BusMasterDetailPanel from '../components/BusMasterDetailPanel';
import { useSocket } from '../hooks/useSocket';
import { useX32 } from '../hooks/useX32';

const DEFAULT_FADERS = [
  { channel: 1, label: 'Kick' },
  { channel: 2, label: 'Snare' },
  { channel: 3, label: 'Bass' },
  { channel: 4, label: 'Guitar' },
  { channel: 5, label: 'Keys' },
  { channel: 6, label: 'Vox' },
  { channel: 7, label: 'Bgv 1' },
  { channel: 8, label: 'Bgv 2' },
];

export default function MonitorMix({ userName }) {
  const { emit, on } = useSocket();
  const [bus, setBus] = useState(1);
  const [faders, setFaders] = useState(DEFAULT_FADERS);
  const [showConfig, setShowConfig] = useState(false);
  const [editingFaders, setEditingFaders] = useState([]);
  const [saved, setSaved] = useState(false);
  const [detailChannel, setDetailChannel] = useState(null);
  const [showBusDetail, setShowBusDetail] = useState(false);

  const {
    setFader, getLevel, setBusMaster, busMasterLevel, x32Status, channelNames, busNames,
    setMute, isMuted,
    requestChannelDetail, requestBusDetail,
    setEqParam, getEqParam, setDynParam, getDynParam,
    setGateParam, getGateParam, setBusEqParam, getBusEqParam, setBusDynParam, getBusDynParam, setBusGateParam, getBusGateParam,
    getSendLevel, setSendLevel, getMeterLevel,
  } = useX32(faders, bus);

  // Resolve display labels: X32 name takes priority over saved label
  const displayFaders = faders.map(f => ({
    ...f,
    label: channelNames[f.channel] || channelNames[String(f.channel)] || f.label,
  }));

  // Estimate bus activity from configured channels using the same post-fader
  // meter logic as strip VU meters.
  const busVuLevel = displayFaders.reduce((max, f) => {
    const sendLevel = getLevel(f.channel);
    const sendGain = sendLevel < 0.001
      ? 0
      : Math.pow(10, ((sendLevel - 0.75) * 80) / 20);
    const vu = Math.min(1, (getMeterLevel?.(f.channel) || 0) * sendGain);
    return Math.max(max, vu);
  }, 0);

  // Load user config on mount
  useEffect(() => {
    if (!userName) return;
    emit('user:load', { name: userName });
    const off = on('user:config', ({ name, config }) => {
      if (name !== userName) return;
      setBus(config.bus || 1);
      if (config.faders && config.faders.length > 0) {
        setFaders(config.faders);
        // Fetch mute states for all configured channels
        config.faders.forEach(f => emit('x32:getMute', { channel: f.channel }));
      }
    });
    return off;
  }, [userName, emit, on]);

  const saveConfig = () => {
    emit('user:save', { name: userName, config: { bus, faders } });
    setSaved(true);
    setShowConfig(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateEditFader = (index, field, value) => {
    setEditingFaders(prev => prev.map((f, i) => {
      if (i !== index) return f;
      const updated = { ...f, [field]: value };
      // Auto-fill label from X32 channel name when channel number changes
      if (field === 'channel') {
        const x32Name = channelNames[value];
        if (x32Name) updated.label = x32Name;
      }
      return updated;
    }));
  };

  const syncLabelsFromX32 = () => {
    setEditingFaders(prev => prev.map(f => {
      const x32Name = channelNames[f.channel];
      return x32Name ? { ...f, label: x32Name } : f;
    }));
  };

  const openConfig = () => {
    setEditingFaders(faders.map(f => ({ ...f })));
    setShowConfig(true);
  };

  const openDetail = (channel) => {
    setDetailChannel(channel);
    requestChannelDetail(channel);
  };

  const openBusMasterDetail = () => {
    setShowBusDetail(true);
    requestBusDetail(bus);
  };

  const addFader = () => {
    setEditingFaders(prev => [...prev, { channel: 1, label: 'New' }]);
  };

  const removeFader = (index) => {
    setEditingFaders(prev => prev.filter((_, i) => i !== index));
  };

  const applyConfig = () => {
    setFaders(editingFaders);
    setBus(bus);
    setShowConfig(false);
    emit('user:save', { name: userName, config: { bus, faders: editingFaders } });
  };

  if (showConfig) {
    return (
      <div style={styles.container}>
        <div style={styles.configHeader}>
          <h2 style={styles.configTitle}>Configure Your Mix</h2>
          <button onClick={() => setShowConfig(false)} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.configSection}>
          <label style={styles.configLabel}>Your Monitor Bus</label>
          <select
            value={bus}
            onChange={(e) => setBus(parseInt(e.target.value))}
            style={styles.busSelect}
          >
            {Array.from({ length: 16 }, (_, i) => i + 1).map(b => (
              <option key={b} value={b}>Bus {b}</option>
            ))}
          </select>
        </div>

        <div style={styles.configSection}>
          <div style={styles.configSectionHeader}>
            <label style={styles.configLabel}>Fader Channels</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.keys(channelNames).length > 0 && (
                <button onClick={syncLabelsFromX32} style={styles.syncBtn} title="Set all labels to X32 channel names">
                  ↺ X32 Names
                </button>
              )}
              <button onClick={addFader} style={styles.addBtn}>+ Add</button>
            </div>
          </div>
          <div style={styles.faderConfigList}>
            {editingFaders.map((f, i) => {
              const x32Name = channelNames[f.channel];
              return (
                <div key={i} style={styles.faderConfigRow}>
                  <div style={styles.channelInputWrap}>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={f.channel}
                      onChange={(e) => updateEditFader(i, 'channel', parseInt(e.target.value) || 1)}
                      style={styles.channelInput}
                      placeholder="Ch"
                    />
                    {x32Name ? (
                      <div style={styles.channelHint}>{x32Name}</div>
                    ) : (
                      <div style={styles.channelHintEmpty}>ch {f.channel}</div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => updateEditFader(i, 'label', e.target.value)}
                    style={styles.labelInput}
                    placeholder="Label"
                    maxLength={10}
                  />
                  <button onClick={() => removeFader(i)} style={styles.removeBtn}>✕</button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.configFooter}>
          <button onClick={() => setShowConfig(false)} style={styles.cancelBtn}>Cancel</button>
          <button onClick={applyConfig} style={styles.saveBtn}>Save & Apply</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Status bar */}
      <div style={styles.statusBar}>
        <div style={styles.statusLeft}>
          <div style={{ ...styles.x32Dot, background: x32Status.connected ? '#00e676' : '#f44336',
            boxShadow: x32Status.connected ? '0 0 6px #00e676' : '0 0 6px #f44336' }} />
          <span style={styles.x32Label}>
            {x32Status.connected ? `X32${x32Status.ip ? ` · ${x32Status.ip}` : ''}` : 'X32 Not Connected'}
          </span>
        </div>
        {saved && <span style={styles.savedBadge}>✓ Saved</span>}
      </div>

      {/* Mix area */}
      <div style={styles.mixArea}>
        <FaderGroup
          faders={displayFaders}
          bus={bus}
          onBusChange={setBus}
          getLevel={getLevel}
          onFaderChange={setFader}
          onConfig={openConfig}
          busNames={busNames}
          isMuted={isMuted}
          onMute={(channel, muted) => setMute(channel, muted)}
          onOpenDetail={openDetail}
          getMeterLevel={getMeterLevel}
        />

        {/* Bus master — visually separated */}
        <div style={styles.lrStrip}>
          <div style={styles.lrBadge}>BUS {bus}</div>
          <Fader
            label={busNames[bus] || `Bus ${bus}`}
            level={busMasterLevel}
            onChange={setBusMaster}
            vuLevel={busVuLevel}
            onOpenDetail={openBusMasterDetail}
          />
        </div>
      </div>

      {/* Channel detail panel (EQ / Comp / Sends) */}
      {detailChannel !== null && (
        <ChannelDetailPanel
          channel={detailChannel}
          channelNames={channelNames}
          busNames={busNames}
          getEqParam={getEqParam}
          setEqParam={setEqParam}
          getDynParam={getDynParam}
          setDynParam={setDynParam}
          getGateParam={getGateParam}
          setGateParam={setGateParam}
          getMeterLevel={getMeterLevel}
          getSendLevel={getSendLevel}
          setSendLevel={setSendLevel}
          onClose={() => setDetailChannel(null)}
        />
      )}

      {showBusDetail && (
        <BusMasterDetailPanel
          bus={bus}
          busNames={busNames}
          getBusEqParam={getBusEqParam}
          setBusEqParam={setBusEqParam}
          getBusDynParam={getBusDynParam}
          setBusDynParam={setBusDynParam}
          getBusGateParam={getBusGateParam}
          setBusGateParam={setBusGateParam}
          getMeterLevel={() => busVuLevel}
          onClose={() => setShowBusDetail(false)}
        />
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
    background: '#080808',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 14px',
    background: 'linear-gradient(90deg, #0d0d0d 0%, #111 100%)',
    borderBottom: '1px solid #1f1f1f',
    flexShrink: 0,
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  x32Dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.3s, box-shadow 0.3s',
  },
  x32Label: {
    fontSize: 11,
    color: '#666',
    letterSpacing: 0.3,
  },
  savedBadge: {
    fontSize: 11,
    color: '#69f0ae',
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  mixArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  lrStrip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    borderLeft: '2px solid rgba(240,165,0,0.35)',
    background: 'linear-gradient(180deg, #151208 0%, #0f0d07 100%)',
    boxShadow: '-4px 0 18px rgba(240,165,0,0.06)',
    minWidth: 100,
    width: 100,
    flexShrink: 0,
    paddingTop: 8,
  },
  lrBadge: {
    fontSize: 10,
    fontWeight: 800,
    color: '#f0a500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
    padding: '4px 10px',
    background: 'rgba(240,165,0,0.14)',
    borderRadius: 4,
    border: '1px solid rgba(240,165,0,0.35)',
  },
  // ── Config sheet ─────────────────────────────────────────────────────────────
  configHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 16px 8px',
    borderBottom: '1px solid #252525',
  },
  configTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
  },
  closeBtn: {
    background: '#252525',
    color: '#aaa',
    fontSize: 18,
    padding: '4px 10px',
    borderRadius: 8,
    minHeight: 36,
    minWidth: 36,
  },
  configSection: {
    padding: '16px',
    borderBottom: '1px solid #1a1a1a',
  },
  configSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  configLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#888',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  busSelect: {
    width: '100%',
    fontSize: 16,
    padding: '10px 12px',
    minHeight: 44,
  },
  syncBtn: {
    background: '#1a1a1a',
    color: '#4fc3f7',
    fontSize: 13,
    padding: '6px 12px',
    borderRadius: 6,
    minHeight: 34,
    border: '1px solid #2a2a2a',
  },
  addBtn: {
    background: '#1a1a1a',
    color: '#f0a500',
    fontSize: 13,
    padding: '6px 12px',
    borderRadius: 6,
    minHeight: 34,
  },
  faderConfigList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  faderConfigRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  channelInputWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
  },
  channelInput: {
    width: 56,
    textAlign: 'center',
    fontSize: 15,
    padding: '8px',
    minHeight: 44,
  },
  channelHint: {
    fontSize: 10,
    color: '#f0a500',
    fontWeight: 600,
    letterSpacing: 0.3,
    maxWidth: 56,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  channelHintEmpty: {
    fontSize: 10,
    color: '#444',
    textAlign: 'center',
  },
  labelInput: {
    flex: 1,
    fontSize: 15,
    padding: '8px 10px',
    minHeight: 44,
  },
  removeBtn: {
    background: '#1a1a1a',
    color: '#f44336',
    fontSize: 16,
    padding: '8px',
    borderRadius: 6,
    minHeight: 44,
    minWidth: 44,
  },
  configFooter: {
    display: 'flex',
    gap: 12,
    padding: 16,
    marginTop: 'auto',
  },
  cancelBtn: {
    flex: 1,
    background: '#1a1a1a',
    color: '#888',
    fontSize: 16,
    padding: '12px',
    borderRadius: 8,
    minHeight: 48,
  },
  saveBtn: {
    flex: 2,
    background: '#f0a500',
    color: '#000',
    fontSize: 16,
    fontWeight: 700,
    padding: '12px',
    borderRadius: 8,
    minHeight: 48,
  },
};
