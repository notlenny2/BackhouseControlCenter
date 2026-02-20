import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

// Guess a source-type icon from the scene name
function sourceIcon(name = '') {
  const n = name.toLowerCase();
  if (n.includes('ndi'))                           return '🌐';
  if (n.includes('rtsp') || n.includes('ip cam'))  return '📡';
  if (n.includes('screen') || n.includes('desktop') || n.includes('display')) return '💻';
  if (n.includes('phone') || n.includes('mobile') || n.includes('iphone') || n.includes('android')) return '📱';
  if (n.includes('hdmi') || n.includes('capture')) return '📥';
  if (n.includes('multi') || n.includes('quad') || n.includes('grid')) return '⊞';
  return '🎥';
}

export default function StreamControl({ isAdmin, onOpenSettings }) {
  const { emit, on } = useSocket();
  const [obsStatus, setObsStatus] = useState({
    connected: false, scenes: [], currentScene: null, streaming: false, recording: false,
  });
  const [screenshot, setScreenshot] = useState(null);
  const [switching, setSwitching] = useState(null); // scene name being switched to

  useEffect(() => {
    const offs = [
      on('obs:status',      (s)  => { setObsStatus(s); setSwitching(null); }),
      on('obs:sceneChanged',({ scene }) => {
        setObsStatus(prev => ({ ...prev, currentScene: scene }));
        setSwitching(null);
      }),
      on('obs:streamStatus',({ streaming })  => setObsStatus(prev => ({ ...prev, streaming }))),
      on('obs:recordStatus',({ recording })  => setObsStatus(prev => ({ ...prev, recording }))),
      on('obs:scenes',      ({ scenes, current }) =>
        setObsStatus(prev => ({ ...prev, scenes, currentScene: current }))),
      on('obs:screenshot',  ({ data }) => setScreenshot(data)),
    ];
    return () => offs.forEach(o => o());
  }, [on]);

  const switchScene = (scene) => {
    setSwitching(scene);
    emit('obs:setScene', { scene });
  };

  const { connected, scenes, currentScene, streaming, recording } = obsStatus;

  return (
    <div style={s.container}>

      {/* Status bar */}
      <div style={s.statusBar}>
        <div style={{ ...s.dot, background: connected ? '#00e676' : '#444',
          boxShadow: connected ? '0 0 6px #00e676' : 'none' }} />
        <span style={s.statusLabel}>
          {connected ? 'OBS Connected' : 'OBS Not Connected'}
        </span>
        {streaming && <span style={s.liveBadge}>● LIVE</span>}
        {recording && <span style={s.recBadge}>⏺ REC</span>}
        {isAdmin && <button onClick={onOpenSettings} style={s.settingsBtn} title="OBS Settings">⚙</button>}
      </div>

      {/* Not connected */}
      {!connected && (
        <div style={s.disconnected}>
          <div style={s.disconnectedIcon}>📡</div>
          <div style={s.disconnectedTitle}>OBS Not Connected</div>
          <div style={s.disconnectedSub}>
            Make sure OBS is open with WebSocket server enabled.{'\n'}
            Tools → WebSocket Server Settings → Enable
          </div>
          {isAdmin && (
            <button onClick={onOpenSettings} style={s.goSettingsBtn}>
              Configure in Settings ⚙
            </button>
          )}
        </div>
      )}

      {/* Connected */}
      {connected && (
        <div style={s.body}>

          {/* Live preview */}
          {screenshot && (
            <div style={s.previewWrap}>
              <img src={screenshot} alt="Live preview" style={s.preview} />
              <div style={s.previewLabel}>
                {streaming && <span style={s.liveChip}>● LIVE</span>}
                {recording && <span style={s.recChip}>⏺ REC</span>}
                <span style={s.previewScene}>{currentScene}</span>
              </div>
            </div>
          )}

          {/* Camera / Scene grid */}
          {scenes.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>CAMERAS & SCENES</div>
              <div style={s.sceneGrid}>
                {scenes.map(scene => {
                  const isActive = scene === currentScene;
                  const isSwitching = scene === switching;
                  return (
                    <button
                      key={scene}
                      onClick={() => !isActive && switchScene(scene)}
                      style={{
                        ...s.sceneBtn,
                        ...(isActive ? s.sceneBtnActive : {}),
                        ...(isSwitching ? s.sceneBtnSwitching : {}),
                      }}
                    >
                      <span style={s.sceneIcon}>{sourceIcon(scene)}</span>
                      <span style={s.sceneName}>{scene}</span>
                      {isActive && <span style={s.activeChip}>LIVE</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stream / Record controls — admin only */}
          {isAdmin && (
            <div style={s.section}>
              <div style={s.sectionTitle}>BROADCAST</div>
              <button
                onClick={() => emit(streaming ? 'obs:stopStream' : 'obs:startStream')}
                style={{ ...s.streamBtn, ...(streaming ? s.streamStopBtn : s.streamStartBtn) }}
              >
                {streaming ? '⏹  Stop Stream' : '📡  Go Live'}
              </button>
              <button
                onClick={() => emit(recording ? 'obs:stopRecording' : 'obs:startRecording')}
                style={{ ...s.recordBtn, ...(recording ? s.recordActiveBtn : {}) }}
              >
                {recording ? '⏹  Stop Recording' : '⏺  Record'}
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    background: '#080808',
  },

  // Status bar
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    background: 'linear-gradient(90deg, #0d0d0d, #111)',
    borderBottom: '1px solid #1f1f1f',
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    transition: 'background 0.3s, box-shadow 0.3s',
  },
  statusLabel: {
    fontSize: 11,
    color: '#555',
    flex: 1,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
  },
  liveBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#f44336',
    letterSpacing: 0.5,
    fontFamily: "'BHP-Mono', monospace",
  },
  recBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#f44336',
    fontFamily: "'BHP-Mono', monospace",
  },
  settingsBtn: {
    background: '#1a1a1a',
    color: '#555',
    fontSize: 15,
    padding: '4px 8px',
    borderRadius: 6,
    minHeight: 30,
    minWidth: 30,
    border: '1px solid #252525',
  },

  // Disconnected state
  disconnected: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    gap: 14,
    textAlign: 'center',
  },
  disconnectedIcon: {
    fontSize: 52,
    opacity: 0.2,
  },
  disconnectedTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#444',
    fontFamily: "'BHP-Label', sans-serif",
  },
  disconnectedSub: {
    fontSize: 12,
    color: '#333',
    lineHeight: 1.7,
    maxWidth: 280,
    fontFamily: "'BHP-Mono', monospace",
    whiteSpace: 'pre-line',
    letterSpacing: 0.2,
  },
  goSettingsBtn: {
    background: 'rgba(240,165,0,0.1)',
    color: '#f0a500',
    fontSize: 14,
    fontWeight: 700,
    padding: '12px 24px',
    borderRadius: 10,
    border: '1px solid rgba(240,165,0,0.25)',
    minHeight: 48,
    marginTop: 4,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.5,
  },

  // Connected body
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 12px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: '#3a3a3a',
    letterSpacing: 1.5,
  },

  // Live preview
  previewWrap: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #1e1e1e',
    background: '#000',
    flexShrink: 0,
  },
  preview: {
    width: '100%',
    display: 'block',
    aspectRatio: '16/9',
    objectFit: 'cover',
  },
  previewLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  liveChip: {
    fontSize: 10,
    fontWeight: 800,
    color: '#fff',
    background: '#f44336',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: 0.5,
    fontFamily: "'BHP-Mono', monospace",
  },
  recChip: {
    fontSize: 10,
    fontWeight: 800,
    color: '#fff',
    background: '#c62828',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: 0.5,
    fontFamily: "'BHP-Mono', monospace",
  },
  previewScene: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
  },

  // Scene grid
  sceneGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  sceneBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 12px',
    background: '#0f0f0f',
    border: '1px solid #1c1c1c',
    borderRadius: 10,
    color: '#666',
    textAlign: 'left',
    minHeight: 52,
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    position: 'relative',
  },
  sceneBtnActive: {
    background: 'rgba(240,165,0,0.07)',
    border: '1px solid rgba(240,165,0,0.35)',
    color: '#f0a500',
  },
  sceneBtnSwitching: {
    opacity: 0.5,
  },
  sceneIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  sceneName: {
    flex: 1,
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  },
  activeChip: {
    fontSize: 9,
    fontWeight: 800,
    color: '#f44336',
    letterSpacing: 0.8,
    fontFamily: "'BHP-Mono', monospace",
    flexShrink: 0,
  },

  // Broadcast controls
  streamBtn: {
    fontSize: 16,
    fontWeight: 700,
    padding: '16px',
    borderRadius: 10,
    minHeight: 56,
    width: '100%',
    fontFamily: "'BHP-Label', sans-serif",
    letterSpacing: 0.5,
  },
  streamStartBtn: {
    background: '#f44336',
    color: '#fff',
    boxShadow: '0 0 20px rgba(244,67,54,0.25)',
    border: 'none',
  },
  streamStopBtn: {
    background: '#2a2a2a',
    color: '#888',
    border: '1px solid #333',
  },
  recordBtn: {
    background: '#141414',
    color: '#666',
    fontSize: 15,
    fontWeight: 600,
    padding: '13px',
    borderRadius: 10,
    minHeight: 50,
    width: '100%',
    border: '1px solid #222',
    fontFamily: "'BHP-Label', sans-serif",
    letterSpacing: 0.5,
  },
  recordActiveBtn: {
    background: 'rgba(244,67,54,0.1)',
    color: '#f44336',
    border: '1px solid rgba(244,67,54,0.3)',
  },
};
