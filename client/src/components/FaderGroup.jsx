import React from 'react';
import Fader from './Fader';
import BusSelector from './BusSelector';

export default function FaderGroup({ faders, bus, onBusChange, getLevel, onFaderChange, onConfig, busNames, isMuted, onMute, onOpenDetail, getMeterLevel }) {
  return (
    <div style={s.container}>
      <div style={s.header}>
        <BusSelector value={bus} onChange={onBusChange} busNames={busNames} />
        {onConfig && (
          <button onClick={onConfig} style={s.configBtn} title="Configure faders">
            ⚙
          </button>
        )}
      </div>
      <div style={s.faders}>
        {faders.map((f) => {
          const sendLevel = getLevel(f.channel);
          // Post-fader VU: scale input meter by the channel's aux send gain.
          // X32 fader law: dB = (value − 0.75) × 80, so unity = 0.75.
          const sendGain = sendLevel < 0.001
            ? 0
            : Math.pow(10, ((sendLevel - 0.75) * 80) / 20);
          const vuLevel = getMeterLevel
            ? Math.min(1, getMeterLevel(f.channel) * sendGain)
            : undefined;
          return (
            <Fader
              key={f.channel}
              channel={f.channel}
              label={f.label}
              level={sendLevel}
              onChange={(level) => onFaderChange(f.channel, level)}
              muted={isMuted ? isMuted(f.channel) : false}
              onMute={onMute ? (m) => onMute(f.channel, m) : undefined}
              onOpenDetail={onOpenDetail}
              vuLevel={vuLevel}
            />
          );
        })}
        {faders.length === 0 && (
          <div style={s.empty}>No faders configured.{'\n'}Tap ⚙ to set up your mix.</div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#0d0d0d',
    borderBottom: '1px solid #222',
    flexShrink: 0,
  },
  faders: {
    display: 'flex',
    flex: 1,
    overflowX: 'auto',
    overflowY: 'hidden',
    minHeight: 0,
  },
  configBtn: {
    background: '#1e1e1e',
    color: '#aaa',
    fontSize: 17,
    padding: '6px 10px',
    borderRadius: 8,
    minHeight: 36,
    minWidth: 36,
    border: '1px solid #333',
    flexShrink: 0,
  },
  empty: {
    color: '#444',
    textAlign: 'center',
    margin: 'auto',
    whiteSpace: 'pre-line',
    lineHeight: 2,
    fontSize: 14,
  },
};
