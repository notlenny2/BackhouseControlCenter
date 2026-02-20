import React, { useRef, useEffect, useState, useCallback } from 'react';

const BAR_W_BASE    = 72;  // default px/bar at zoom 1x
const RULER_H       = 28;
const TRACK_H_CUE   = 36;
const TRACK_H_AUDIO = 180;
const LABEL_W       = 46;
const DRAG_THRESHOLD = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cueX(cue, beatsPerBar, barW) {
  return ((cue.bar - 1) + (cue.beat - 1) / beatsPerBar) * barW;
}

function xToBarBeat(x, beatsPerBar, barW) {
  const beatW = barW / beatsPerBar;
  const bar   = Math.max(1, Math.floor(x / barW) + 1);
  const beat  = Math.max(1, Math.min(beatsPerBar, Math.floor((x % barW) / beatW) + 1));
  return { bar, beat };
}

function beatsToTime(beats, bpm) {
  const totalMs = (beats / bpm) * 60000;
  const m  = Math.floor(totalMs / 60000);
  const s  = Math.floor((totalMs % 60000) / 1000);
  const ms = Math.floor(totalMs % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function cueColor(cue) {
  if (cue.midi) {
    if (cue.midi.type === 'pc')  return '#64b5f6';
    if (cue.midi.type === 'cc')  return '#ce93d8';
    return '#a5d6a7';
  }
  if (cue.osc) return '#f0a500';
  return '#888';
}

// ─── Waveform decode + cache ──────────────────────────────────────────────────

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

// Cache: url → { peaksL, peaksR, durationSec }
// Each peaks object: { maxP, minP, rmsP: Float32Array }
const waveCache = new Map();

// 500 bins per second → ~90 000 bins for a 3-min file.
// At max zoom (4×, 144 css-px/sec, DPR 2 → 288 physical px/sec)
// that gives ~1.7 bins/px — plenty sharp.
const N_PEAKS_PER_SEC = 500;

function computePeaks(ch, n) {
  const step = Math.max(1, Math.floor(ch.length / n));
  const maxP = new Float32Array(n);
  const minP = new Float32Array(n);
  const rmsP = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let max = 0, min = 0, sumSq = 0, count = 0;
    const start = i * step;
    const end   = Math.min(start + step, ch.length);
    for (let j = start; j < end; j++) {
      const s = ch[j];
      if (s > max) max = s;
      if (s < min) min = s;
      sumSq += s * s;
      count++;
    }
    maxP[i] = max;
    minP[i] = min;
    rmsP[i] = count > 0 ? Math.sqrt(sumSq / count) : 0;
  }
  return { maxP, minP, rmsP };
}

function useWaveform(url) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!url) return;
    if (waveCache.has(url)) {
      setData(waveCache.get(url));
      return;
    }

    let cancelled = false;
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => getAudioCtx().decodeAudioData(buf))
      .then(ab => {
        if (cancelled) return;
        const n      = Math.max(2000, Math.round(ab.duration * N_PEAKS_PER_SEC));
        const peaksL = computePeaks(ab.getChannelData(0), n);
        const peaksR = ab.numberOfChannels > 1
          ? computePeaks(ab.getChannelData(1), n)
          : peaksL;
        const entry = { peaksL, peaksR, durationSec: ab.duration };
        waveCache.set(url, entry);
        setData(entry);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [url]);

  return data;
}

// ─── Waveform canvas ──────────────────────────────────────────────────────────

// Draws one channel into the canvas using direct ImageData pixel writing.
// All coordinates are in physical (device) pixels.
function drawChannel(ctx, peaks, startY, chH, pw) {
  const midY    = chH / 2;
  const halfH   = midY * 0.91;
  const n       = peaks.maxP.length;
  const chInt   = Math.round(chH);
  const startYR = Math.round(startY);

  const img = ctx.getImageData(0, startYR, pw, chInt);
  const d   = img.data;

  for (let px = 0; px < pw; px++) {
    // Map pixel column to a range of peak bins (handles both zoom-in and zoom-out)
    const f0 = (px / pw) * n;
    const f1 = ((px + 1) / pw) * n;
    const i0 = Math.floor(f0);
    const i1 = Math.min(n - 1, Math.ceil(f1));

    let pMax = 0, pMin = 0, rms = 0;
    for (let i = i0; i <= i1; i++) {
      if (peaks.maxP[i] > pMax) pMax = peaks.maxP[i];
      if (peaks.minP[i] < pMin) pMin = peaks.minP[i];
      if (peaks.rmsP[i] > rms)  rms  = peaks.rmsP[i];
    }

    const peakTop = Math.max(0, Math.round(midY - pMax * halfH));
    const peakBot = Math.min(chInt - 1, Math.round(midY - pMin * halfH));
    const rmsHalf = rms * halfH;
    const rmsTop  = Math.max(0, Math.round(midY - rmsHalf));
    const rmsBot  = Math.min(chInt - 1, Math.round(midY + rmsHalf));
    const midInt  = Math.round(midY);

    for (let py = peakTop; py <= peakBot; py++) {
      const inRms = py >= rmsTop && py <= rmsBot;
      const base  = (py * pw + px) * 4;

      if (inRms) {
        // Gradient: bright teal at centre, fading toward peak tips
        const dist = Math.abs(py - midInt);
        const t    = rmsHalf > 0 ? Math.max(0, 1 - dist / (rmsHalf + 1)) : 1;
        d[base]     = 0;
        d[base + 1] = Math.round(175 + t * 54);  // 175–229
        d[base + 2] = Math.round(155 + t * 49);  // 155–204
        d[base + 3] = Math.round(150 + t * 90);  // 150–240
      } else {
        // Dim outer peak envelope
        d[base]     = 0;
        d[base + 1] = 100;
        d[base + 2] = 90;
        d[base + 3] = 50;
      }
    }
  }

  ctx.putImageData(img, 0, startYR);

  // Zero-line hairline
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, startYR + Math.round(midY), pw, 1);
}

function WaveformCanvas({ peaksL, peaksR, width, height }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!peaksL || !ref.current || width <= 0 || height <= 0) return;
    const canvas = ref.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw  = Math.round(width  * dpr);
    const ph  = Math.round(height * dpr);

    canvas.width  = pw;
    canvas.height = ph;
    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#020c0b';
    ctx.fillRect(0, 0, pw, ph);

    const chH = ph / 2;

    drawChannel(ctx, peaksL, 0,   chH, pw);
    drawChannel(ctx, peaksR, chH, chH, pw);

    // Channel divider
    ctx.fillStyle = 'rgba(0,229,204,0.08)';
    ctx.fillRect(0, Math.round(chH), pw, 1);

    // L / R labels in physical px coords
    ctx.fillStyle = 'rgba(0,229,204,0.45)';
    ctx.font = `bold ${Math.round(8 * dpr)}px monospace`;
    ctx.fillText('L', 3 * dpr, 10 * dpr);
    ctx.fillText('R', 3 * dpr, Math.round(chH) + 10 * dpr);
  }, [peaksL, peaksR, width, height]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', top: 0, left: 0, display: 'block', pointerEvents: 'none' }}
    />
  );
}

// ─── Drag hook ────────────────────────────────────────────────────────────────

function useDrag({ onTap, onDragEnd }) {
  const dragRef     = useRef(null);
  const justDragged = useRef(false);

  const onPointerDown = useCallback((e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    justDragged.current = false;
    dragRef.current = { el: e.currentTarget, startX: e.clientX, dx: 0, moved: false };
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    d.moved = true;
    d.dx = dx;
    d.el.style.transform = `translateX(${dx}px)`;
    d.el.style.zIndex    = '20';
    d.el.style.opacity   = '0.7';
    d.el.style.cursor    = 'grabbing';
  }, []);

  const onPointerUp = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    d.el.style.transform = '';
    d.el.style.zIndex    = '';
    d.el.style.opacity   = '';
    d.el.style.cursor    = '';
    if (d.moved) {
      justDragged.current = true;
      onDragEnd(d.dx);
    }
  }, [onDragEnd]);

  const onClick = useCallback((e) => {
    e.stopPropagation();
    if (justDragged.current) { justDragged.current = false; return; }
    onTap();
  }, [onTap]);

  const onPointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    d.el.style.transform = '';
    d.el.style.zIndex    = '';
    d.el.style.opacity   = '';
    d.el.style.cursor    = '';
    justDragged.current  = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick };
}

// ─── Audio clip ───────────────────────────────────────────────────────────────

function AudioClip({ cue, firedCues, beatsPerBar, bpm, barW, onEdit, onMove }) {
  const fired    = firedCues.includes(cue.id);
  const x        = cueX(cue, beatsPerBar, barW);
  const url      = cue.audio?.file ? `/audio/${encodeURIComponent(cue.audio.file)}` : null;
  const waveData = useWaveform(url);
  const label    = (cue.audio?.file || '').replace(/\.[^.]+$/, '');

  const pps     = (barW / beatsPerBar) * (bpm / 60);
  const clipW   = waveData ? Math.max(barW * 1.5, waveData.durationSec * pps) : barW * 2;
  const clipH   = TRACK_H_AUDIO - 16;
  const waveH   = clipH - 18; // below title bar

  const handlers = useDrag({
    onTap: () => onEdit(cue),
    onDragEnd: (dx) => {
      const { bar, beat } = xToBarBeat(Math.max(0, x + dx), beatsPerBar, barW);
      onMove(cue.id, bar, beat);
    },
  });

  return (
    <div
      {...handlers}
      title={cue.label}
      style={{
        position: 'absolute',
        left: x,
        top: 8,
        width: clipW,
        height: clipH,
        background: '#020c0b',
        border: '1px solid #00695c',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        opacity: fired ? 0.3 : 1,
        zIndex: 2,
      }}
    >
      {/* Title bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 18,
        background: 'rgba(0,105,92,0.8)',
        padding: '0 6px',
        display: 'flex', alignItems: 'center', gap: 5,
        zIndex: 3, pointerEvents: 'none',
        borderBottom: '1px solid rgba(0,229,204,0.15)',
      }}>
        <span style={{ fontSize: 10, color: '#b2dfdb', fontWeight: 700, fontFamily: "'BHP-Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {label || cue.label}
        </span>
        {cue.audio?.loop && <span style={{ fontSize: 9, color: '#4db6ac', flexShrink: 0 }}>↻</span>}
        {fired && <span style={{ fontSize: 9, color: '#4caf50', flexShrink: 0 }}>✓</span>}
      </div>

      {/* Waveform area */}
      <div style={{ position: 'absolute', top: 18, left: 0, width: clipW, height: waveH }}>
        {waveData ? (
          <WaveformCanvas
            peaksL={waveData.peaksL}
            peaksR={waveData.peaksR}
            width={clipW}
            height={waveH}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'repeating-linear-gradient(90deg,#010a09 0px,#021410 6px,#010a09 12px)',
          }} />
        )}
      </div>
    </div>
  );
}

// ─── Diamond cue marker ───────────────────────────────────────────────────────

function DiamondMarker({ cue, firedCues, beatsPerBar, barW, onEdit, onMove }) {
  const fired = firedCues.includes(cue.id);
  const x     = cueX(cue, beatsPerBar, barW);
  const color = cueColor(cue);

  const handlers = useDrag({
    onTap: () => onEdit(cue),
    onDragEnd: (dx) => {
      const { bar, beat } = xToBarBeat(Math.max(0, x + dx), beatsPerBar, barW);
      onMove(cue.id, bar, beat);
    },
  });

  return (
    <div
      {...handlers}
      title={cue.label}
      style={{
        position: 'absolute',
        left: x - 7,
        top: 0,
        height: TRACK_H_CUE,
        display: 'flex',
        alignItems: 'flex-start',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        opacity: fired ? 0.3 : 1,
        zIndex: 2,
        minWidth: 120,
      }}
    >
      <div style={{ position: 'relative', width: 14, height: TRACK_H_CUE, flexShrink: 0 }}>
        <div style={{
          position: 'absolute',
          top: 4, left: 1,
          width: 12, height: 12,
          background: color,
          transform: 'rotate(45deg)',
          borderRadius: 1,
          boxShadow: `0 0 6px ${color}88`,
        }} />
        <div style={{
          position: 'absolute',
          left: 6, top: 16,
          width: 1,
          height: TRACK_H_CUE - 18,
          background: `${color}44`,
        }} />
      </div>
      <div style={{
        position: 'absolute',
        left: 17, top: 5,
        whiteSpace: 'nowrap',
        fontSize: 10,
        fontWeight: 700,
        color,
        fontFamily: "'BHP-Mono', monospace",
        letterSpacing: 0.3,
        pointerEvents: 'none',
      }}>
        {cue.label}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TimelineView({
  cues = [],
  firedCues = [],
  totalBeats = 0,
  beatsPerBar = 4,
  bpm = 120,
  barW = BAR_W_BASE,
  running = false,
  onAdd,
  onEdit,
  onMove,
  onDropAudio,
}) {
  const scrollRef     = useRef(null);
  const lastScrollBar = useRef(-1);
  const [dragOver, setDragOver] = useState(false);

  const beatW      = barW / beatsPerBar;
  const lastCueBar = cues.length > 0 ? Math.max(...cues.map(c => c.bar)) : 0;
  const numBars    = Math.max(32, lastCueBar + 8);
  const trackWidth = numBars * barW;
  const totalWidth = LABEL_W + trackWidth;
  const totalH     = RULER_H + TRACK_H_CUE + TRACK_H_AUDIO;

  const playheadX  = LABEL_W + totalBeats * beatW;
  const currentBar = Math.floor(totalBeats / beatsPerBar);

  useEffect(() => {
    if (!running || !scrollRef.current) return;
    if (currentBar === lastScrollBar.current) return;
    lastScrollBar.current = currentBar;
    const el = scrollRef.current;
    el.scrollTo({ left: Math.max(0, playheadX - el.clientWidth * 0.35), behavior: 'smooth' });
  }, [currentBar, running, playheadX]);

  const handleTrackTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    if (x < 0) return;
    const { bar, beat } = xToBarBeat(x, beatsPerBar, barW);
    onAdd(bar, beat);
  };

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('application/bhp-audio')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    setDragOver(false);
    const fileName = e.dataTransfer.getData('application/bhp-audio');
    if (!fileName) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    if (x < 0) return;
    const { bar, beat } = xToBarBeat(x, beatsPerBar, barW);
    onDropAudio(fileName, bar, beat);
  };

  const audioCues   = cues.filter(c => c.audio?.file);
  const controlCues = cues.filter(c => !c.audio?.file);

  return (
    <div style={s.outer}>
      <div ref={scrollRef} style={s.scroll}>
        <div style={{ ...s.inner, width: totalWidth, height: totalH }}>

          {/* ── Ruler ── */}
          <div style={{ ...s.rulerRow, width: totalWidth }}>
            <div style={{ ...s.labelCell, height: RULER_H }} />
            <div style={{ position: 'relative', width: trackWidth, height: RULER_H, flexShrink: 0 }}>
              {Array.from({ length: numBars }, (_, i) => {
                // Skip labels that would overlap at low zoom
                const labelEvery = barW < 30 ? 8 : barW < 50 ? 4 : barW < 80 ? 2 : 1;
                const showLabel = i % labelEvery === 0;
                return (
                  <React.Fragment key={i}>
                    <div style={{ ...s.barLine, left: i * barW }}>
                      {showLabel && (
                        <span style={s.barLabel}>{beatsToTime(i * beatsPerBar, bpm)}</span>
                      )}
                    </div>
                    {[1, 2, 3].map(b => (
                      <div key={b} style={{ ...s.beatTick, left: i * barW + b * beatW }} />
                    ))}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ── Cue track ── */}
          <div style={{ ...s.trackRow, height: TRACK_H_CUE, top: RULER_H, width: totalWidth }}>
            <div style={{ ...s.labelCell, height: TRACK_H_CUE }}>
              <span style={s.trackLabel}>CUES</span>
            </div>
            <div style={{ ...s.track, width: trackWidth, height: TRACK_H_CUE }} onClick={handleTrackTap}>
              {Array.from({ length: numBars }, (_, i) => (
                <div key={i} style={{ ...s.gridLine, left: i * barW }} />
              ))}
              {controlCues.map(cue => (
                <DiamondMarker
                  key={cue.id}
                  cue={cue}
                  firedCues={firedCues}
                  beatsPerBar={beatsPerBar}
                  barW={barW}
                  onEdit={onEdit}
                  onMove={onMove}
                />
              ))}
            </div>
          </div>

          {/* ── Audio track ── */}
          <div style={{ ...s.trackRow, height: TRACK_H_AUDIO, top: RULER_H + TRACK_H_CUE, width: totalWidth }}>
            <div style={{ ...s.labelCell, height: TRACK_H_AUDIO }}>
              <span style={s.trackLabel}>AUDIO</span>
            </div>
            <div
              style={{
                ...s.track,
                width: trackWidth,
                height: TRACK_H_AUDIO,
                background: dragOver ? 'rgba(0,229,204,0.05)' : '#060e0c',
                outline: dragOver ? '2px dashed rgba(0,229,204,0.4)' : 'none',
                outlineOffset: '-2px',
              }}
              onClick={handleTrackTap}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {Array.from({ length: numBars }, (_, i) => (
                <div key={i} style={{ ...s.gridLine, left: i * barW }} />
              ))}
              {audioCues.map(cue => (
                <AudioClip
                  key={cue.id}
                  cue={cue}
                  firedCues={firedCues}
                  beatsPerBar={beatsPerBar}
                  bpm={bpm}
                  barW={barW}
                  onEdit={onEdit}
                  onMove={onMove}
                />
              ))}
              {dragOver && (
                <div style={s.dropHint}>Drop to place on timeline</div>
              )}
            </div>
          </div>

          {/* ── Playhead ── */}
          <div style={{ ...s.playhead, left: playheadX, height: totalH }} />

        </div>
      </div>

      <div style={s.hint}>drag to move · tap to edit · tap track to add · drag file from list to audio track</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  outer: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: '#060e0c',
  },
  scroll: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative',
    WebkitOverflowScrolling: 'touch',
  },
  inner: {
    position: 'relative',
  },
  rulerRow: {
    display: 'flex',
    height: RULER_H,
    position: 'absolute',
    top: 0, left: 0,
    background: '#0a0a0a',
    borderBottom: '1px solid #1e1e1e',
    zIndex: 5,
  },
  trackRow: {
    display: 'flex',
    position: 'absolute',
    left: 0,
    borderBottom: '1px solid #111',
  },
  labelCell: {
    width: LABEL_W,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#080808',
    borderRight: '1px solid #161616',
  },
  trackLabel: {
    fontSize: 8,
    color: '#252525',
    fontWeight: 700,
    letterSpacing: 1.2,
    fontFamily: "'BHP-Mono', monospace",
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
    transform: 'rotate(180deg)',
  },
  track: {
    position: 'relative',
    flexShrink: 0,
    cursor: 'crosshair',
    overflow: 'visible',
  },
  gridLine: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 1,
    background: '#0e1a18',
    pointerEvents: 'none',
  },
  barLine: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 1,
    background: '#1e2e2c',
    display: 'flex',
    alignItems: 'flex-end',
    paddingBottom: 3,
  },
  barLabel: {
    fontSize: 8,
    color: '#3a5550',
    fontWeight: 700,
    fontFamily: "'BHP-Mono', monospace",
    paddingLeft: 3,
    whiteSpace: 'nowrap',
  },
  beatTick: {
    position: 'absolute',
    bottom: 0,
    height: 5,
    width: 1,
    background: '#141e1d',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    width: 2,
    background: '#f0a500',
    pointerEvents: 'none',
    boxShadow: '0 0 10px rgba(240,165,0,0.6)',
    zIndex: 10,
  },
  dropHint: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(0,229,204,0.5)',
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.5,
    pointerEvents: 'none',
  },
  hint: {
    fontSize: 8,
    color: '#1a2825',
    textAlign: 'center',
    padding: '3px 0',
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.5,
    flexShrink: 0,
  },
};
