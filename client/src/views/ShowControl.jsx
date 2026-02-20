import React, { useState, useEffect, useCallback, useRef } from 'react';
import TimelineView from '../components/TimelineView';
import { useSocket } from '../hooks/useSocket';
import { useAudio } from '../hooks/useAudio';

export default function ShowControl() {
  const { emit, on } = useSocket();
  const [timelineState, setTimelineState] = useState({
    running: false, bpm: 120, bar: 1, beat: 1, beatsPerBar: 4, cues: [], firedCues: []
  });
  const [totalBeats, setTotalBeats] = useState(0);
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState('');
  const [editingCue, setEditingCue] = useState(null);
  const [showCueEditor, setShowCueEditor] = useState(false);
  const [midiStatus, setMidiStatus] = useState({ available: false });
  const [zoom, setZoom] = useState(1);

  // ── Audio engine ────────────────────────────────────────────────────────────
  const { playClick, playFile, stopFile, playingFiles } = useAudio();
  const playClickRef = useRef(playClick);
  const playFileRef  = useRef(playFile);
  useEffect(() => { playClickRef.current = playClick; }, [playClick]);
  useEffect(() => { playFileRef.current  = playFile;  }, [playFile]);

  const [clickEnabled, setClickEnabledState] = useState(
    () => localStorage.getItem('bhp-click') === 'true'
  );
  const [clickVolume, setClickVolumeState] = useState(
    () => parseFloat(localStorage.getItem('bhp-click-vol') || '0.7')
  );
  const clickEnabledRef = useRef(clickEnabled);
  const clickVolumeRef  = useRef(clickVolume);

  const setClickEnabled = (v) => {
    setClickEnabledState(v);
    clickEnabledRef.current = v;
    localStorage.setItem('bhp-click', v);
  };
  const setClickVolume = (v) => {
    setClickVolumeState(v);
    clickVolumeRef.current = v;
    localStorage.setItem('bhp-click-vol', v);
  };

  const lastBeatIdxRef = useRef(-1);

  const [audioFiles, setAudioFiles] = useState([]);
  const [audioExpanded, setAudioExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/audio').then(r => r.json()).then(setAudioFiles).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/shows').then(r => r.json()).then(setShows).catch(() => {});

    const offs = [
      on('timeline:state', setTimelineState),
      on('timeline:tick', ({ bar, beat, totalBeats: tb }) => {
        setTimelineState(prev => ({ ...prev, bar, beat }));
        if (tb !== undefined) {
          setTotalBeats(tb);
          const beatIdx = Math.floor(tb);
          if (beatIdx !== lastBeatIdxRef.current) {
            lastBeatIdxRef.current = beatIdx;
            if (clickEnabledRef.current) {
              playClickRef.current(beat === 1, clickVolumeRef.current);
            }
          }
        }
      }),
      on('timeline:cue', (cue) => {
        setTimelineState(prev => ({
          ...prev,
          firedCues: [...new Set([...prev.firedCues, cue.id])]
        }));
        // Cue-triggered audio playback
        if (cue.audio && cue.audio.file) {
          playFileRef.current(
            `/audio/${encodeURIComponent(cue.audio.file)}`,
            (cue.audio.volume ?? 100) / 100,
            cue.audio.loop || false
          );
        }
      }),
      on('timeline:showLoaded', ({ name }) => setSelectedShow(name)),
      on('midi:status', setMidiStatus),
    ];
    return () => offs.forEach(off => off());
  }, [on]);

  const loadShow = (name) => {
    if (!name) return;
    emit('timeline:loadShow', { name });
  };

  const saveShow = () => {
    if (!selectedShow) return;
    const showData = {
      name: selectedShow,
      bpm: timelineState.bpm,
      cues: timelineState.cues
    };
    emit('timeline:saveShow', { name: selectedShow, show: showData });
  };

  const handleBpmChange = (e) => {
    const bpm = parseInt(e.target.value) || 120;
    emit('timeline:setBpm', { bpm });
  };

  const handleFireCue = (cueId) => {
    emit('timeline:fireCue', { cueId });
  };

  const handleAddCue = (bar, beat) => {
    const newCue = {
      id: Date.now(),
      bar: bar ?? timelineState.bar,
      beat: beat ?? timelineState.beat,
      label: 'New Cue',
      midi: null,
    };
    setEditingCue(newCue);
    setShowCueEditor(true);
  };

  const handleEditCue = (cue) => {
    setEditingCue({ ...cue });
    setShowCueEditor(true);
  };

  const handleDeleteCue = (cueId) => {
    const newCues = timelineState.cues.filter(c => c.id !== cueId);
    setTimelineState(prev => ({ ...prev, cues: newCues }));
  };

  const handleDropAudio = (fileName, bar, beat) => {
    const newCue = {
      id: Date.now(),
      bar,
      beat,
      label: fileName.replace(/\.[^.]+$/, ''),
      midi: null,
      audio: { file: fileName, volume: 100, loop: false },
    };
    setTimelineState(prev => ({
      ...prev,
      cues: [...prev.cues, newCue].sort((a, b) => a.bar !== b.bar ? a.bar - b.bar : a.beat - b.beat),
    }));
  };

  const handleMoveCue = (cueId, newBar, newBeat) => {
    const newCues = timelineState.cues
      .map(c => c.id === cueId ? { ...c, bar: newBar, beat: newBeat } : c)
      .sort((a, b) => a.bar !== b.bar ? a.bar - b.bar : a.beat - b.beat);
    setTimelineState(prev => ({ ...prev, cues: newCues }));
  };

  const saveCue = () => {
    if (!editingCue) return;
    const exists = timelineState.cues.find(c => c.id === editingCue.id);
    const newCues = exists
      ? timelineState.cues.map(c => c.id === editingCue.id ? editingCue : c)
      : [...timelineState.cues, editingCue].sort((a, b) => {
          if (a.bar !== b.bar) return a.bar - b.bar;
          return a.beat - b.beat;
        });
    setTimelineState(prev => ({ ...prev, cues: newCues }));
    setShowCueEditor(false);
    setEditingCue(null);
  };

  const { running, bpm, bar, beat, cues, firedCues } = timelineState;
  const barW = Math.round(72 * zoom);

  if (showCueEditor && editingCue) {
    return <CueEditor cue={editingCue} onChange={setEditingCue} onSave={saveCue} onCancel={() => setShowCueEditor(false)} audioFiles={audioFiles} />;
  }

  return (
    <div style={styles.container}>
      {/* Transport controls */}
      <div style={styles.transport}>
        <div style={styles.clock}>
          <span style={styles.barNum}>{String(bar).padStart(3, ' ')}</span>
          <span style={styles.clockSep}>.</span>
          <span style={styles.beatNum}>{beat}</span>
        </div>

        <div style={styles.transportButtons}>
          <button onClick={() => emit('timeline:reset')} style={styles.resetBtn} title="Reset">⏮</button>
          <button
            onClick={() => emit('timeline:toggle')}
            style={{ ...styles.playBtn, ...(running ? styles.stopBtn : {}) }}
          >
            {running ? '⏸' : '▶'}
          </button>
        </div>

        <div style={styles.bpmControl}>
          <label style={styles.bpmLabel}>BPM</label>
          <input
            type="number"
            min={20}
            max={300}
            value={bpm}
            onChange={handleBpmChange}
            style={styles.bpmInput}
          />
        </div>
      </div>

      {/* Show file controls */}
      <div style={styles.showBar}>
        <select
          value={selectedShow}
          onChange={(e) => { setSelectedShow(e.target.value); loadShow(e.target.value); }}
          style={styles.showSelect}
        >
          <option value="">— Load Show —</option>
          {shows.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={saveShow} style={styles.saveBtn} disabled={!selectedShow}>
          Save
        </button>
      </div>

      {/* Click Track */}
      <div style={styles.clickPanel}>
        <span style={styles.clickLabel}>CLICK</span>
        <button
          onClick={() => setClickEnabled(!clickEnabled)}
          style={clickEnabled ? styles.clickOnBtn : styles.clickOffBtn}
        >
          {clickEnabled ? '● ON' : '○ OFF'}
        </button>
        {clickEnabled && (
          <input
            type="range" min={0} max={1} step={0.05}
            value={clickVolume}
            onChange={e => setClickVolume(parseFloat(e.target.value))}
            style={styles.clickSlider}
          />
        )}
        {clickEnabled && (
          <span style={styles.clickVol}>{Math.round(clickVolume * 100)}%</span>
        )}
      </div>

      {/* Audio Tracks */}
      <div style={styles.audioPanel}>
        <div style={styles.audioPanelHeader} onClick={() => setAudioExpanded(v => !v)}>
          <span style={styles.audioPanelTitle}>
            AUDIO TRACKS{audioFiles.length > 0 ? ` (${audioFiles.length})` : ''}
          </span>
          <div style={styles.audioPanelActions}>
            <label style={styles.uploadLabel} onClick={e => e.stopPropagation()}>
              + Upload
              <input
                type="file"
                accept="audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const files = Array.from(e.target.files);
                  if (!files.length) return;
                  const fd = new FormData();
                  files.forEach(f => fd.append('files', f));
                  await fetch('/api/audio', { method: 'POST', body: fd });
                  fetch('/api/audio').then(r => r.json()).then(data => {
                    setAudioFiles(data);
                    setAudioExpanded(true);
                  }).catch(() => {});
                  e.target.value = '';
                }}
              />
            </label>
            <span style={styles.audioCaret}>{audioExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        {audioExpanded && (
          <div style={styles.audioList}>
            {audioFiles.length === 0 && (
              <div style={styles.audioEmpty}>No audio files — tap Upload to add tracks</div>
            )}
            {audioFiles.map(file => {
              const url = `/audio/${encodeURIComponent(file.name)}`;
              const isPlaying = playingFiles.has(url);
              return (
                <div
                  key={file.name}
                  style={styles.audioRow}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/bhp-audio', file.name);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <span style={styles.audioDragHandle}>⠿</span>
                  <span style={styles.audioName}>{file.name}</span>
                  <button
                    onClick={() => isPlaying ? stopFile(url) : playFile(url)}
                    style={isPlaying ? styles.audioStopBtn : styles.audioPlayBtn}
                  >
                    {isPlaying ? '⏹' : '▶'}
                  </button>
                  <button
                    onClick={async () => {
                      await fetch(`/api/audio/${encodeURIComponent(file.name)}`, { method: 'DELETE' });
                      setAudioFiles(prev => prev.filter(f => f.name !== file.name));
                    }}
                    style={styles.audioDeleteBtn}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MIDI status */}
      {!midiStatus.available && (
        <div style={styles.midiWarning}>
          ⚠ No MIDI output available
        </div>
      )}

      {/* Timeline */}
      <div style={styles.cueSection}>
        <div style={styles.timelineHeader}>
          <span style={styles.timelineTitle}>TIMELINE</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))} style={styles.zoomBtn}>−</button>
            <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} style={styles.zoomBtn}>+</button>
            <button onClick={() => handleAddCue()} style={styles.addCueBtn}>+ Add Cue</button>
          </div>
        </div>
        <TimelineView
          cues={cues}
          firedCues={firedCues}
          totalBeats={totalBeats}
          beatsPerBar={timelineState.beatsPerBar}
          bpm={bpm}
          barW={barW}
          running={running}
          onAdd={handleAddCue}
          onEdit={handleEditCue}
          onMove={handleMoveCue}
          onDropAudio={handleDropAudio}
        />
      </div>
    </div>
  );
}

// ─── OSC preview: mirrors server-side resolveCueOsc ──────────────────────────

function previewOsc(osc) {
  if (!osc || !osc.preset) return [];
  const pad = (n) => String(n || 1).padStart(2, '0');
  const lvl = (pct) => (Math.max(0, Math.min(1, (pct ?? 75) / 100))).toFixed(3);
  const onVal = (a) => a === 'unmute' ? 1 : 0;

  switch (osc.preset) {
    case 'scene_recall':  return [`/-show/showfile/scene/index  [${(osc.scene||1)-1}]`, `/-show/showfile/scene/go`];
    case 'ch_mute':       return [`/ch/${pad(osc.channel)}/mix/on  [${onVal(osc.action)}]`];
    case 'ch_fader':      return [`/ch/${pad(osc.channel)}/mix/fader  [${lvl(osc.level)}]`];
    case 'bus_mute':      return [`/bus/${pad(osc.bus)}/mix/on  [${onVal(osc.action)}]`];
    case 'bus_fader':     return [`/bus/${pad(osc.bus)}/mix/fader  [${lvl(osc.level)}]`];
    case 'dca_mute':      return [`/dca/${osc.dca||1}/on  [${onVal(osc.action)}]`];
    case 'dca_fader':     return [`/dca/${osc.dca||1}/fader  [${lvl(osc.level)}]`];
    case 'lr_fader':      return [`/main/st/mix/fader  [${lvl(osc.level)}]`];
    case 'lr_mute':       return [`/main/st/mix/on  [${onVal(osc.action)}]`];
    case 'custom':        return osc.customAddress ? [`${osc.customAddress}  ${(osc.customArgs||[]).map(a=>`[${a.value}]`).join(' ')}`] : [];
    default: return [];
  }
}

const OSC_PRESETS = [
  { value: 'scene_recall', label: 'Scene Recall' },
  { value: 'ch_mute',      label: 'Channel Mute' },
  { value: 'ch_fader',     label: 'Channel Fader' },
  { value: 'bus_mute',     label: 'Bus Mute' },
  { value: 'bus_fader',    label: 'Bus Fader' },
  { value: 'dca_mute',     label: 'DCA Mute' },
  { value: 'dca_fader',    label: 'DCA Fader' },
  { value: 'lr_fader',     label: 'Main LR Fader' },
  { value: 'lr_mute',      label: 'Main LR Mute' },
  { value: 'custom',       label: 'Custom OSC' },
];

function CueEditor({ cue, onChange, onSave, onCancel, audioFiles = [] }) {
  const update = (field, value) => onChange(prev => ({ ...prev, [field]: value }));
  const updateMidi = (field, value) => onChange(prev => ({
    ...prev,
    midi: { ...prev.midi, [field]: value }
  }));
  const toggleMidi = () => onChange(prev => ({
    ...prev,
    midi: prev.midi ? null : { type: 'pc', channel: 1, value: 0 }
  }));

  const updateOsc = (field, value) => onChange(prev => ({
    ...prev,
    osc: { ...prev.osc, [field]: value }
  }));
  const toggleOsc = () => onChange(prev => ({
    ...prev,
    osc: prev.osc ? null : { preset: 'ch_mute', channel: 1, action: 'mute' }
  }));

  return (
    <div style={edStyles.container}>
      <div style={edStyles.header}>
        <h2 style={edStyles.title}>Edit Cue</h2>
        <button onClick={onCancel} style={edStyles.closeBtn}>✕</button>
      </div>

      <div style={edStyles.body}>
        <Field label="Label">
          <input value={cue.label} onChange={e => update('label', e.target.value)} style={edStyles.input} />
        </Field>
        <Field label="Song">
          <input value={cue.song || ''} onChange={e => update('song', e.target.value)} style={edStyles.input} placeholder="Optional" />
        </Field>
        <div style={edStyles.row}>
          <Field label="Bar">
            <input type="number" min={1} value={cue.bar} onChange={e => update('bar', parseInt(e.target.value) || 1)} style={edStyles.numInput} />
          </Field>
          <Field label="Beat">
            <input type="number" min={1} max={4} value={cue.beat} onChange={e => update('beat', parseInt(e.target.value) || 1)} style={edStyles.numInput} />
          </Field>
        </div>

        <div style={edStyles.midiToggle}>
          <span style={edStyles.fieldLabel}>MIDI Output</span>
          <button onClick={toggleMidi} style={cue.midi ? edStyles.midiOnBtn : edStyles.midiOffBtn}>
            {cue.midi ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {cue.midi && (
          <>
            <Field label="MIDI Type">
              <select value={cue.midi.type} onChange={e => updateMidi('type', e.target.value)} style={edStyles.select}>
                <option value="pc">Program Change</option>
                <option value="cc">Control Change</option>
                <option value="note">Note On</option>
              </select>
            </Field>
            <Field label="Channel">
              <input type="number" min={1} max={16} value={cue.midi.channel} onChange={e => updateMidi('channel', parseInt(e.target.value) || 1)} style={edStyles.numInput} />
            </Field>
            {cue.midi.type === 'pc' && (
              <Field label="Program (0–127)">
                <input type="number" min={0} max={127} value={cue.midi.value} onChange={e => updateMidi('value', parseInt(e.target.value) || 0)} style={edStyles.numInput} />
              </Field>
            )}
            {cue.midi.type === 'cc' && (
              <>
                <Field label="CC Number (0–127)">
                  <input type="number" min={0} max={127} value={cue.midi.cc || 0} onChange={e => updateMidi('cc', parseInt(e.target.value) || 0)} style={edStyles.numInput} />
                </Field>
                <Field label="Value (0–127)">
                  <input type="number" min={0} max={127} value={cue.midi.value} onChange={e => updateMidi('value', parseInt(e.target.value) || 0)} style={edStyles.numInput} />
                </Field>
              </>
            )}
            {cue.midi.type === 'note' && (
              <>
                <Field label="Note (0–127)">
                  <input type="number" min={0} max={127} value={cue.midi.note || 60} onChange={e => updateMidi('note', parseInt(e.target.value) || 60)} style={edStyles.numInput} />
                </Field>
                <Field label="Velocity (0–127)">
                  <input type="number" min={0} max={127} value={cue.midi.velocity || 100} onChange={e => updateMidi('velocity', parseInt(e.target.value) || 100)} style={edStyles.numInput} />
                </Field>
              </>
            )}
          </>
        )}

        {/* ── X32 / OSC Control ─────────────────────────────── */}
        <div style={edStyles.divider} />

        <div style={edStyles.oscToggle}>
          <span style={edStyles.fieldLabel}>X32 Control</span>
          <button onClick={toggleOsc} style={cue.osc ? edStyles.oscOnBtn : edStyles.oscOffBtn}>
            {cue.osc ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {cue.osc && (
          <>
            <Field label="Preset">
              <select
                value={cue.osc.preset || 'ch_mute'}
                onChange={e => updateOsc('preset', e.target.value)}
                style={edStyles.select}
              >
                {OSC_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>

            {/* Scene Recall */}
            {cue.osc.preset === 'scene_recall' && (
              <Field label="Scene Number">
                <input
                  type="number" min={1} max={500}
                  value={cue.osc.scene || 1}
                  onChange={e => updateOsc('scene', parseInt(e.target.value) || 1)}
                  style={edStyles.numInput}
                />
              </Field>
            )}

            {/* Channel fields */}
            {(cue.osc.preset === 'ch_mute' || cue.osc.preset === 'ch_fader') && (
              <Field label="Channel (1–32)">
                <input
                  type="number" min={1} max={32}
                  value={cue.osc.channel || 1}
                  onChange={e => updateOsc('channel', parseInt(e.target.value) || 1)}
                  style={edStyles.numInput}
                />
              </Field>
            )}

            {/* Bus fields */}
            {(cue.osc.preset === 'bus_mute' || cue.osc.preset === 'bus_fader') && (
              <Field label="Bus (1–16)">
                <input
                  type="number" min={1} max={16}
                  value={cue.osc.bus || 1}
                  onChange={e => updateOsc('bus', parseInt(e.target.value) || 1)}
                  style={edStyles.numInput}
                />
              </Field>
            )}

            {/* DCA fields */}
            {(cue.osc.preset === 'dca_mute' || cue.osc.preset === 'dca_fader') && (
              <Field label="DCA (1–8)">
                <input
                  type="number" min={1} max={8}
                  value={cue.osc.dca || 1}
                  onChange={e => updateOsc('dca', parseInt(e.target.value) || 1)}
                  style={edStyles.numInput}
                />
              </Field>
            )}

            {/* Mute/Unmute action */}
            {(cue.osc.preset === 'ch_mute' || cue.osc.preset === 'bus_mute' ||
              cue.osc.preset === 'dca_mute' || cue.osc.preset === 'lr_mute') && (
              <Field label="Action">
                <div style={edStyles.actionRow}>
                  {['mute', 'unmute'].map(a => (
                    <button
                      key={a}
                      onClick={() => updateOsc('action', a)}
                      style={(cue.osc.action || 'mute') === a ? edStyles.actionBtnOn : edStyles.actionBtnOff}
                    >
                      {a === 'mute' ? 'Mute' : 'Unmute'}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* Fader level */}
            {(cue.osc.preset === 'ch_fader' || cue.osc.preset === 'bus_fader' ||
              cue.osc.preset === 'dca_fader' || cue.osc.preset === 'lr_fader') && (
              <Field label="Level (0–100%)">
                <input
                  type="number" min={0} max={100}
                  value={cue.osc.level ?? 75}
                  onChange={e => updateOsc('level', parseInt(e.target.value) ?? 75)}
                  style={edStyles.numInput}
                />
              </Field>
            )}

            {/* Custom OSC */}
            {cue.osc.preset === 'custom' && (
              <>
                <Field label="OSC Address">
                  <input
                    value={cue.osc.customAddress || ''}
                    onChange={e => updateOsc('customAddress', e.target.value)}
                    placeholder="/ch/01/mix/fader"
                    style={edStyles.input}
                  />
                </Field>
                <Field label={'Args (JSON, e.g. [{"type":"f","value":0.75}])'}>
                  <input
                    value={cue.osc.customArgsRaw || ''}
                    onChange={e => {
                      updateOsc('customArgsRaw', e.target.value);
                      try { updateOsc('customArgs', JSON.parse(e.target.value)); } catch {}
                    }}
                    placeholder='[{"type":"f","value":0.75}]'
                    style={edStyles.input}
                  />
                </Field>
              </>
            )}

            {/* OSC preview */}
            {previewOsc(cue.osc).length > 0 && (
              <div style={edStyles.oscPreview}>
                <div style={edStyles.oscPreviewLabel}>OSC PREVIEW</div>
                {previewOsc(cue.osc).map((line, i) => (
                  <div key={i} style={edStyles.oscPreviewLine}>{line}</div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Audio Cue ───────────────────────────────────────── */}
        <div style={edStyles.divider} />

        <div style={edStyles.oscToggle}>
          <span style={edStyles.fieldLabel}>Audio Cue</span>
          <button
            onClick={() => onChange(prev => ({
              ...prev,
              audio: prev.audio ? null : { file: '', volume: 100, loop: false }
            }))}
            style={cue.audio ? edStyles.oscOnBtn : edStyles.oscOffBtn}
          >
            {cue.audio ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {cue.audio && (
          <>
            <Field label="Audio File">
              <select
                value={cue.audio.file || ''}
                onChange={e => onChange(prev => ({ ...prev, audio: { ...prev.audio, file: e.target.value } }))}
                style={edStyles.select}
              >
                <option value="">— Select File —</option>
                {audioFiles.map(f => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Volume (0–100%)">
              <input
                type="number" min={0} max={100}
                value={cue.audio.volume ?? 100}
                onChange={e => onChange(prev => ({ ...prev, audio: { ...prev.audio, volume: parseInt(e.target.value) ?? 100 } }))}
                style={edStyles.numInput}
              />
            </Field>
            <div style={edStyles.midiToggle}>
              <span style={edStyles.fieldLabel}>Loop</span>
              <button
                onClick={() => onChange(prev => ({ ...prev, audio: { ...prev.audio, loop: !prev.audio.loop } }))}
                style={cue.audio.loop ? edStyles.midiOnBtn : edStyles.midiOffBtn}
              >
                {cue.audio.loop ? 'On' : 'Off'}
              </button>
            </div>
            {cue.audio.file && (
              <div style={edStyles.oscPreview}>
                <div style={edStyles.oscPreviewLabel}>AUDIO PREVIEW</div>
                <div style={edStyles.oscPreviewLine}>{cue.audio.file}</div>
                <div style={{ ...edStyles.oscPreviewLine, opacity: 0.5 }}>
                  vol {cue.audio.volume ?? 100}%{cue.audio.loop ? ' · loop' : ''}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={edStyles.footer}>
        <button onClick={onCancel} style={edStyles.cancelBtn}>Cancel</button>
        <button onClick={onSave} style={edStyles.saveBtn}>Save Cue</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={edStyles.field}>
      <label style={edStyles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    gap: 0,
  },
  transport: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: '#111',
    borderBottom: '1px solid #222',
  },
  clock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 2,
    fontFamily: 'monospace',
  },
  barNum: {
    fontSize: 36,
    fontWeight: 700,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: -1,
  },
  clockSep: {
    fontSize: 24,
    color: '#444',
    margin: '0 2px',
  },
  beatNum: {
    fontSize: 28,
    fontWeight: 700,
    color: '#f0a500',
    fontVariantNumeric: 'tabular-nums',
  },
  transportButtons: {
    display: 'flex',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  resetBtn: {
    background: '#222',
    color: '#888',
    fontSize: 22,
    borderRadius: 50,
    width: 48,
    height: 48,
  },
  playBtn: {
    background: '#f0a500',
    color: '#000',
    fontSize: 22,
    borderRadius: 50,
    width: 56,
    height: 56,
    fontWeight: 700,
    boxShadow: '0 0 20px rgba(240,165,0,0.4)',
  },
  stopBtn: {
    background: '#e05c00',
    boxShadow: '0 0 20px rgba(224,92,0,0.4)',
  },
  bpmControl: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  bpmLabel: {
    fontSize: 10,
    color: '#555',
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bpmInput: {
    width: 68,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 700,
    padding: '6px 4px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    fontVariantNumeric: 'tabular-nums',
    minHeight: 44,
  },
  showBar: {
    display: 'flex',
    gap: 8,
    padding: '8px 12px',
    background: '#0d0d0d',
    borderBottom: '1px solid #1a1a1a',
  },
  showSelect: {
    flex: 1,
    fontSize: 14,
    minHeight: 38,
  },
  saveBtn: {
    background: '#252525',
    color: '#f0a500',
    fontSize: 14,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 8,
    minHeight: 38,
    border: '1px solid #f0a500',
  },
  midiWarning: {
    background: 'rgba(244,67,54,0.1)',
    color: '#f44336',
    fontSize: 12,
    padding: '6px 12px',
    textAlign: 'center',
    borderBottom: '1px solid rgba(244,67,54,0.2)',
  },
  cueSection: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  timelineHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    background: '#0d0d0d',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  timelineTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: '#2a2a2a',
    letterSpacing: 1.5,
    fontFamily: "'BHP-Mono', monospace",
  },
  addCueBtn: {
    background: '#151515',
    color: '#f0a500',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid rgba(240,165,0,0.25)',
    minHeight: 28,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
  },
  zoomBtn: {
    background: '#151515',
    color: '#555',
    fontSize: 14,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 5,
    border: '1px solid #252525',
    minHeight: 24,
    minWidth: 24,
    fontFamily: "'BHP-Mono', monospace",
    lineHeight: 1,
  },
  zoomLabel: {
    fontSize: 10,
    color: '#3a3a3a',
    fontFamily: "'BHP-Mono', monospace",
    minWidth: 32,
    textAlign: 'center',
  },

  // ── Click track ────────────────────────────────────────
  clickPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    background: '#0a0a0a',
    borderBottom: '1px solid #161616',
    flexShrink: 0,
  },
  clickLabel: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: '#444',
    letterSpacing: 1.5,
    minWidth: 38,
  },
  clickOnBtn: {
    background: 'rgba(240,165,0,0.12)',
    color: '#f0a500',
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid rgba(240,165,0,0.35)',
    minHeight: 28,
    minWidth: 56,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.5,
  },
  clickOffBtn: {
    background: '#141414',
    color: '#3a3a3a',
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 10px',
    borderRadius: 6,
    border: '1px solid #222',
    minHeight: 28,
    minWidth: 56,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.5,
  },
  clickSlider: {
    flex: 1,
    accentColor: '#f0a500',
    height: 4,
  },
  clickVol: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    color: '#f0a500',
    minWidth: 34,
    textAlign: 'right',
    opacity: 0.8,
  },

  // ── Audio panel ────────────────────────────────────────
  audioPanel: {
    background: '#0a0a0a',
    borderBottom: '1px solid #161616',
    flexShrink: 0,
  },
  audioPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  audioPanelTitle: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    color: '#3a3a3a',
    letterSpacing: 1.5,
  },
  audioPanelActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  uploadLabel: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 10,
    color: '#f0a500',
    cursor: 'pointer',
    padding: '3px 8px',
    border: '1px solid rgba(240,165,0,0.25)',
    borderRadius: 5,
    letterSpacing: 0.5,
  },
  audioCaret: {
    fontSize: 9,
    color: '#2a2a2a',
  },
  audioList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    maxHeight: 200,
    overflowY: 'auto',
    borderTop: '1px solid #141414',
  },
  audioEmpty: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    color: '#2a2a2a',
    padding: '14px 12px',
    textAlign: 'center',
  },
  audioRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    background: '#0d0d0d',
    cursor: 'grab',
    userSelect: 'none',
  },
  audioDragHandle: {
    fontSize: 13,
    color: '#2a2a2a',
    flexShrink: 0,
    lineHeight: 1,
  },
  audioName: {
    flex: 1,
    fontSize: 12,
    color: '#777',
    fontFamily: "'BHP-Mono', monospace",
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  audioPlayBtn: {
    background: '#181818',
    color: '#f0a500',
    fontSize: 13,
    padding: '5px 11px',
    borderRadius: 6,
    border: '1px solid #252525',
    minHeight: 30,
    minWidth: 34,
  },
  audioStopBtn: {
    background: 'rgba(244,67,54,0.1)',
    color: '#f44336',
    fontSize: 13,
    padding: '5px 11px',
    borderRadius: 6,
    border: '1px solid rgba(244,67,54,0.25)',
    minHeight: 30,
    minWidth: 34,
  },
  audioDeleteBtn: {
    background: 'transparent',
    color: '#2a2a2a',
    fontSize: 12,
    padding: '5px 7px',
    borderRadius: 6,
    border: 'none',
    minHeight: 30,
  },
};

const edStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 16px 8px',
    borderBottom: '1px solid #252525',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
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
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    display: 'flex',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#777',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    width: '100%',
    fontSize: 15,
    padding: '10px 12px',
    minHeight: 44,
  },
  numInput: {
    width: '100%',
    fontSize: 18,
    fontWeight: 700,
    padding: '8px 10px',
    textAlign: 'center',
    minHeight: 44,
  },
  select: {
    width: '100%',
    fontSize: 15,
    padding: '10px 12px',
    minHeight: 44,
  },
  midiToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  midiOnBtn: {
    background: 'rgba(76,175,80,0.15)',
    color: '#4caf50',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #4caf50',
    minHeight: 38,
  },
  midiOffBtn: {
    background: '#1a1a1a',
    color: '#555',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #333',
    minHeight: 38,
  },
  divider: {
    height: 1,
    background: '#222',
    margin: '4px 0',
  },
  oscToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  oscOnBtn: {
    background: 'rgba(240,165,0,0.15)',
    color: '#f0a500',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid rgba(240,165,0,0.5)',
    minHeight: 38,
  },
  oscOffBtn: {
    background: '#1a1a1a',
    color: '#555',
    fontSize: 14,
    fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #333',
    minHeight: 38,
  },
  actionRow: {
    display: 'flex',
    gap: 8,
  },
  actionBtnOn: {
    flex: 1,
    background: 'rgba(240,165,0,0.15)',
    color: '#f0a500',
    fontSize: 14,
    fontWeight: 700,
    padding: '10px',
    borderRadius: 8,
    border: '1px solid rgba(240,165,0,0.5)',
    minHeight: 44,
  },
  actionBtnOff: {
    flex: 1,
    background: '#1a1a1a',
    color: '#555',
    fontSize: 14,
    padding: '10px',
    borderRadius: 8,
    border: '1px solid #2a2a2a',
    minHeight: 44,
  },
  oscPreview: {
    background: '#0a0a0a',
    border: '1px solid #252525',
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  oscPreviewLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#444',
    letterSpacing: 1.5,
    marginBottom: 4,
    fontFamily: "'BHP-Mono', monospace",
  },
  oscPreviewLine: {
    fontSize: 12,
    color: '#f0a500',
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
    opacity: 0.8,
  },
  footer: {
    display: 'flex',
    gap: 12,
    padding: 16,
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
