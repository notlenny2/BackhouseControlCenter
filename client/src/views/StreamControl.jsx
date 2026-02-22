import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
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

function prefersHlsByQuery() {
  try {
    return new URLSearchParams(window.location.search).get('hls') === '1';
  } catch {
    return false;
  }
}

function HLSPreview({ fallbackImg, scene, streaming, recording, preferScreenshot }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [active, setActive] = useState(false);
  const hlsUrl = `${window.location.origin}/hls/live/stream/index.m3u8`;

  useEffect(() => {
    if (preferScreenshot) {
      setActive(false);
      return undefined;
    }
    const vid = videoRef.current;
    if (!vid) return undefined;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        backBufferLength: 0,
        maxBufferLength: 1,
        maxMaxBufferLength: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(vid);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setActive(true);
        try { vid.play?.(); } catch {}
      });
      hls.on(Hls.Events.LEVEL_UPDATED, () => {
        // Keep preview close to live edge; avoids drift into buffered delay.
        try {
          if (!Number.isFinite(vid.currentTime)) return;
          const edge = hls.liveSyncPosition;
          if (!Number.isFinite(edge)) return;
          if (edge - vid.currentTime > 1.25) vid.currentTime = edge - 0.1;
        } catch {}
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setActive(false);
          setTimeout(() => { try { hls.loadSource(hlsUrl); } catch {} }, 3000);
        }
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (vid.canPlayType('application/vnd.apple.mpegurl')) {
      vid.src = hlsUrl;
      const onLoad = () => {
        setActive(true);
        try {
          vid.currentTime = Number.MAX_SAFE_INTEGER;
          vid.play?.();
        } catch {}
      };
      const onErr = () => setActive(false);
      vid.addEventListener('loadedmetadata', onLoad);
      vid.addEventListener('error', onErr);
      return () => {
        vid.removeEventListener('loadedmetadata', onLoad);
        vid.removeEventListener('error', onErr);
      };
    }

    return undefined;
  }, [hlsUrl, preferScreenshot]);

  return (
    <div style={s.previewWrap}>
      <video ref={videoRef} autoPlay playsInline muted style={{ ...s.preview, display: active ? 'block' : 'none' }} />
      {!active && (fallbackImg ? (
        <img src={fallbackImg} alt="Live preview" style={s.preview} />
      ) : (
        <div style={s.previewBlank}>
          <span style={s.previewHint}>
            OBS Stream Settings:{'\n'}
            Service: Custom{'\n'}
            Server: rtmp://localhost:1935/live{'\n'}
            Stream Key: stream
          </span>
        </div>
      ))}
      <div style={s.previewLabel}>
        {active && <span style={s.hlsChip}>▶ HLS</span>}
        {!active && fallbackImg && <span style={s.hlsChip}>⚡ FAST</span>}
        {streaming && <span style={s.liveChip}>● LIVE</span>}
        {recording && <span style={s.recChip}>⏺ REC</span>}
        <span style={s.previewScene}>{scene}</span>
      </div>
    </div>
  );
}

export default function StreamControl({ isAdmin, onOpenSettings }) {
  const { emit, on, connected: socketConnected } = useSocket();
  // Default to low-latency screenshot preview. HLS can be forced with ?hls=1.
  const preferScreenshot = !prefersHlsByQuery();
  const [obsStatus, setObsStatus] = useState({
    connected: false, scenes: [], currentScene: null, streaming: false, recording: false,
  });
  const [screenshot, setScreenshot] = useState(null);
  const [scenePreviews, setScenePreviews] = useState({});
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
      on('obs:scenePreview', ({ scene, data }) => {
        setScenePreviews(prev => ({ ...prev, [scene]: data }));
      }),
    ];
    return () => offs.forEach(o => o());
  }, [on]);

  // Ensure scene list/status is refreshed when this view is opened or reconnects.
  useEffect(() => {
    if (!socketConnected) return;
    emit('status:request');
    emit('obs:requestScenePreviews');
  }, [socketConnected, emit]);

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
          <div style={s.programPane}>
            <HLSPreview
              fallbackImg={screenshot}
              scene={currentScene}
              streaming={streaming}
              recording={recording}
              preferScreenshot={preferScreenshot}
            />
          </div>

          {/* Camera / Scene previews */}
          {scenes.length > 0 && (
            <div style={s.cameraPane}>
              <div style={s.sectionTitle}>CAMERAS</div>
              <div style={s.sceneList}>
                {scenes.map(scene => {
                  const isActive = scene === currentScene;
                  const isSwitching = scene === switching;
                  const sceneImg = scenePreviews[scene];
                  return (
                    <button
                      key={scene}
                      onClick={() => !isActive && switchScene(scene)}
                      style={{
                        ...s.sceneCard,
                        ...(isActive ? s.sceneCardActive : {}),
                        ...(isSwitching ? s.sceneBtnSwitching : {}),
                      }}
                    >
                      <div style={s.sceneThumbWrap}>
                        {sceneImg ? (
                          <img src={sceneImg} alt={scene} style={s.sceneThumb} />
                        ) : (
                          <div style={s.sceneThumbBlank}>
                            <span style={s.sceneIcon}>{sourceIcon(scene)}</span>
                          </div>
                        )}
                      </div>
                      <div style={s.sceneMeta}>
                        <span style={s.sceneName}>{scene}</span>
                        {isActive && <span style={s.activeChip}>LIVE</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stream / Record controls — admin only */}
          {isAdmin && (
            <div style={s.broadcastPane}>
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
    overflow: 'hidden',
    padding: '10px 10px 14px',
    display: 'flex',
    gap: 10,
  },
  programPane: { flex: 1.35, minWidth: 0, display: 'flex', flexDirection: 'column' },
  cameraPane: {
    flex: 1.1,
    minWidth: 340,
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    overflow: 'hidden',
  },
  broadcastPane: {
    width: 250,
    flexShrink: 0,
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
  previewBlank: {
    width: '100%',
    aspectRatio: '16/9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    background: '#050505',
  },
  previewHint: {
    fontSize: 12,
    lineHeight: 1.6,
    textAlign: 'center',
    whiteSpace: 'pre-line',
    fontFamily: "'BHP-Mono', monospace",
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
  hlsChip: {
    fontSize: 10,
    fontWeight: 800,
    color: '#fff',
    background: '#2e7d32',
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

  // Scene previews
  sceneList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    overflowY: 'auto',
    paddingRight: 2,
  },
  sceneCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 6,
    background: '#0f0f0f',
    border: '1px solid #1c1c1c',
    borderRadius: 10,
    color: '#666',
    textAlign: 'left',
    minHeight: 132,
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    position: 'relative',
  },
  sceneCardActive: {
    background: 'rgba(240,165,0,0.07)',
    border: '1px solid rgba(240,165,0,0.35)',
    color: '#f0a500',
  },
  sceneBtnSwitching: {
    opacity: 0.5,
  },
  sceneIcon: {
    fontSize: 22,
    flexShrink: 0,
  },
  sceneThumbWrap: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #222',
    background: '#000',
    aspectRatio: '16/9',
  },
  sceneThumb: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  sceneThumbBlank: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
  },
  sceneMeta: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 2px',
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
