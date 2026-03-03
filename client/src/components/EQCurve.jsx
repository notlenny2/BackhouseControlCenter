// EQCurve.jsx — Interactive frequency response display for X32 4-band EQ
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const BAND_COLORS = ['#4488ff', '#44ee88', '#ffcc33', '#ff7744'];
const BAND_LABELS = ['LF', 'LMF', 'HMF', 'HF'];
const EQ_TYPE_NAMES = ['LC', 'LShv', 'PEQ', 'VEQ', 'HShv', 'HC'];
const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const DB_TICKS = [-12, -9, -6, -3, 0, 3, 6, 9, 12];

const FMIN = 20, FMAX = 20000, DMIN = -18, DMAX = 18;
const HANDLE_R = 12; // handle radius px

// ─── X32 param conversions ────────────────────────────────────────────────────
const pToFreq = p => 20 * Math.pow(1000, p ?? 0.5);
const freqToP = f => Math.max(0, Math.min(1, Math.log(Math.max(20, f) / 20) / Math.log(1000)));
const pToGain = p => ((p ?? 0.5) - 0.5) * 30;
const gainToP = g => Math.max(0, Math.min(1, g / 30 + 0.5));
const pToQ    = p => 0.3 * Math.pow(10 / 0.3, p ?? 0.5);

// ─── Canvas coordinate helpers ────────────────────────────────────────────────
const fToX = (f, W) => W * Math.log(Math.max(f, FMIN) / FMIN) / Math.log(FMAX / FMIN);
const xToF = (x, W) => Math.max(FMIN, Math.min(FMAX, FMIN * Math.pow(FMAX / FMIN, x / W)));
const dToY = (db, H) => H * (1 - (db - DMIN) / (DMAX - DMIN));
const yToD = (y, H) => DMIN + (DMAX - DMIN) * (1 - y / H);

// ─── Frequency response per band ─────────────────────────────────────────────
function bandResp(f, freq, gainDb, q, type) {
  if (!freq || freq <= 0) return 0;
  const r = f / freq, ir = freq / f;
  switch (type) {
    case 2: case 3: { // PEQ, VEQ — peaking bell
      const d = r - ir;
      return gainDb / (1 + q * q * d * d);
    }
    case 1: { // Low shelf
      return gainDb * (0.5 + 0.5 * Math.tanh(Math.log(ir) * Math.max(0.5, q * 0.5)));
    }
    case 4: { // High shelf
      return gainDb * (0.5 + 0.5 * Math.tanh(Math.log(r) * Math.max(0.5, q * 0.5)));
    }
    case 0: case 7: // LC / HP — rolloff below f0
      if (f < freq) return Math.max(-60, -24 * Math.log2(freq / f));
      return 0;
    case 5: case 6: // HC / LP — rolloff above f0
      if (f > freq) return Math.max(-60, -24 * Math.log2(f / freq));
      return 0;
    default: return 0;
  }
}

// ─── Draw the canvas ─────────────────────────────────────────────────────────
function drawEQ(canvas, bands, selectedIdx) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (!W || !H) return;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d0d12');
  bg.addColorStop(1, '#080808');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── dB grid lines ──────────────────────────────────────────────────────────
  for (const db of DB_TICKS) {
    const y = dToY(db, H);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    if (db === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    if (db % 6 === 0 && db !== 0) {
      ctx.fillStyle = '#383838';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, W - 5, y);
    }
  }
  // 0dB label
  ctx.fillStyle = '#555';
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('0', W - 5, dToY(0, H));

  // ── Frequency grid lines ───────────────────────────────────────────────────
  const labelH = 18; // bottom label area
  for (const f of FREQ_TICKS) {
    const x = fToX(f, W);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H - labelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
    ctx.fillStyle = '#363636';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, H - 2);
  }

  // ── Per-band response curves (thin, colored) ───────────────────────────────
  for (const b of bands) {
    ctx.beginPath();
    let first = true;
    for (let px = 0; px < W; px += 2) {
      const f = xToF(px, W);
      const db = Math.max(DMIN, Math.min(DMAX, bandResp(f, b.freq, b.gainDb, b.q, b.type)));
      const y = dToY(db, H - labelH);
      if (first) { ctx.moveTo(px, y); first = false; } else ctx.lineTo(px, y);
    }
    ctx.strokeStyle = b.color + '55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Combined response curve ────────────────────────────────────────────────
  const pts = [];
  for (let px = 0; px <= W; px += 2) {
    const f = xToF(px, W);
    let total = 0;
    for (const b of bands) total += bandResp(f, b.freq, b.gainDb, b.q, b.type);
    pts.push({ x: px, y: dToY(Math.max(DMIN, Math.min(DMAX, total)), H - labelH) });
  }

  // Fill under curve
  const y0 = dToY(0, H - labelH);
  ctx.beginPath();
  ctx.moveTo(0, y0);
  for (const pt of pts) ctx.lineTo(pt.x, pt.y);
  ctx.lineTo(W, y0);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, H - labelH);
  fill.addColorStop(0,   'rgba(0,255,136,0.18)');
  fill.addColorStop(0.5, 'rgba(0,255,136,0.06)');
  fill.addColorStop(1,   'rgba(0,255,136,0.01)');
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  let firstPt = true;
  for (const pt of pts) {
    if (firstPt) { ctx.moveTo(pt.x, pt.y); firstPt = false; } else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── Band handles ───────────────────────────────────────────────────────────
  for (const b of bands) {
    const showGain = [1, 2, 3, 4].includes(b.type);
    const hx = fToX(b.freq, W);
    const hy = showGain ? dToY(b.gainDb, H - labelH) : y0;
    const sel = b.idx === selectedIdx;
    const r = sel ? HANDLE_R + 2 : HANDLE_R;

    // Glow ring for selected
    if (sel) {
      ctx.beginPath();
      ctx.arc(hx, hy, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = b.color + '44';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Handle fill
    const hGrad = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.3, 1, hx, hy, r);
    hGrad.addColorStop(0, sel ? '#fff' : b.color + 'dd');
    hGrad.addColorStop(0.4, b.color);
    hGrad.addColorStop(1, b.color + '88');
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fillStyle = hGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#000';
    ctx.font = `bold ${sel ? 12 : 11}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BAND_LABELS[b.idx], hx, hy);
  }

  ctx.textBaseline = 'alphabetic';
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EQCurve({ ch, getEqParam, setEqParam }) {
  const canvasRef  = useRef(null);
  const dragRef    = useRef(null);
  const [selectedBand, setSelectedBand] = useState(0); // 0-indexed

  // Derive band objects from EQ params
  const bands = useMemo(() => [1, 2, 3, 4].map((band, idx) => {
    const freqP = getEqParam(ch, band, 'f') ?? 0.5;
    const gainP = getEqParam(ch, band, 'g') ?? 0.5;
    const qP    = getEqParam(ch, band, 'q') ?? 0.5;
    const type  = Math.round(getEqParam(ch, band, 'type') ?? 2);
    return {
      idx, band,
      type, freqP, gainP, qP,
      freq:   pToFreq(freqP),
      gainDb: pToGain(gainP),
      q:      pToQ(qP),
      color:  BAND_COLORS[idx],
    };
  }), [ch, getEqParam]);

  // Redraw whenever bands or selected band changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawEQ(canvas, bands, selectedBand);
  }, [bands, selectedBand]);

  // Redraw on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => drawEQ(canvas, bands, selectedBand));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [bands, selectedBand]);

  // ── Pointer interaction ────────────────────────────────────────────────────
  const getXY = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }, []);

  const hitTest = useCallback((x, y) => {
    const canvas = canvasRef.current;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight - 18;
    let best = null, bestDist = HANDLE_R + 12;
    for (const b of bands) {
    const showGain = [1, 2, 3, 4].includes(b.type);
      const hx = fToX(b.freq, W);
      const hy = showGain ? dToY(b.gainDb, H) : dToY(0, H);
      const d  = Math.hypot(x - hx, y - hy);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }, [bands]);

  const onDown = useCallback((e) => {
    const { x, y } = getXY(e);
    const hit = hitTest(x, y);
    if (!hit) return;
    setSelectedBand(hit.idx);
    dragRef.current = { band: hit, lastX: x, lastY: y };
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [getXY, hitTest]);

  const onMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const canvas = canvasRef.current;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight - 18;
    const { x, y } = getXY(e);

    // Frequency: derive from absolute X position
    const newFreq  = xToF(x, W);
    const newFreqP = freqToP(newFreq);

    // Gain: drag delta mapped to dB range
    const dGain   = -(y - drag.lastY) * (DMAX - DMIN) / H;
    const newGainDb = Math.max(-15, Math.min(15, drag.band.gainDb + dGain));
    const newGainP  = gainToP(newGainDb);

    setEqParam(ch, drag.band.band, 'f', newFreqP);
    setEqParam(ch, drag.band.band, 'g', newGainP);

    // Update cached band in drag so delta works across moves
    dragRef.current.lastX = x;
    dragRef.current.lastY = y;
    dragRef.current.band  = { ...drag.band, freq: newFreq, gainDb: newGainDb,
                                             freqP: newFreqP, gainP: newGainP };
    e.preventDefault();
  }, [ch, setEqParam, getXY]);

  const onUp = useCallback(() => { dragRef.current = null; }, []);

  // ── Selected band sliders ──────────────────────────────────────────────────
  const sb = bands[selectedBand];
  const freqHz = sb.freq >= 1000
    ? `${(sb.freq / 1000).toFixed(1)} kHz`
    : `${Math.round(sb.freq)} Hz`;
  const gainStr = `${sb.gainDb >= 0 ? '+' : ''}${sb.gainDb.toFixed(1)} dB`;
  const qStr    = sb.q.toFixed(2);

  return (
    <div>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 260, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />

      {/* Band selector tabs */}
      <div style={cs.bandTabs}>
        {bands.map(b => (
          <button key={b.band}
            style={{ ...cs.bandTab, ...(selectedBand === b.idx ? { ...cs.bandTabActive, borderColor: b.color, color: b.color, background: b.color + '22' } : {}) }}
            onClick={() => setSelectedBand(b.idx)}
          >
            <span style={{ ...cs.bandDot, background: b.color }} />
            {BAND_LABELS[b.idx]}
          </button>
        ))}
      </div>

      {/* Controls for selected band */}
      <div style={cs.controls}>
        {/* FREQ */}
        <SliderRow label="FREQ" value={freqHz} accent={sb.color}>
          <input type="range" min="0" max="1" step="0.0005"
            value={sb.freqP}
            style={{ ...cs.slider, accentColor: sb.color }}
            onChange={e => setEqParam(ch, sb.band, 'f', parseFloat(e.target.value))}
          />
        </SliderRow>

        {/* GAIN (only meaningful for PEQ/VEQ/shelf) */}
        {[1, 2, 3, 4].includes(sb.type) && (
          <SliderRow label="GAIN" value={gainStr} accent="#ffaa00">
            <input type="range" min="0" max="1" step="0.001"
              value={sb.gainP}
              style={{ ...cs.slider, accentColor: '#ffaa00' }}
              onChange={e => setEqParam(ch, sb.band, 'g', parseFloat(e.target.value))}
            />
          </SliderRow>
        )}

        {/* Q */}
        {[1, 2, 3, 4].includes(sb.type) && (
          <SliderRow label="Q" value={qStr} accent="#00aaff">
            <input type="range" min="0" max="1" step="0.001"
              value={sb.qP}
              style={{ ...cs.slider, accentColor: '#00aaff' }}
              onChange={e => setEqParam(ch, sb.band, 'q', parseFloat(e.target.value))}
            />
          </SliderRow>
        )}

        {/* TYPE */}
        <div style={cs.typeRow}>
          <span style={cs.typeLabel}>TYPE</span>
          <select
            style={cs.typeSelect}
            value={sb.type}
            onChange={e => setEqParam(ch, sb.band, 'type', parseInt(e.target.value))}
          >
            {EQ_TYPE_NAMES.map((t, i) => <option key={i} value={i}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, accent, children }) {
  return (
    <div style={cs.sliderRow}>
      <div style={cs.sliderMeta}>
        <span style={cs.sliderLabel}>{label}</span>
        <span style={{ ...cs.sliderValue, color: accent }}>{value}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const cs = {
  bandTabs: {
    display: 'flex',
    gap: 8,
    padding: '14px 0 10px',
    borderBottom: '1px solid #1e1e1e',
    marginBottom: 4,
  },
  bandTab: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    background: '#1a1a1a',
    border: '1px solid #2e2e2e',
    borderRadius: 8,
    color: '#555',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1,
    padding: '10px 4px',
    cursor: 'pointer',
    transition: 'all 0.12s',
  },
  bandTabActive: {
    background: 'transparent',
  },
  bandDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    flexShrink: 0,
  },
  controls: {
    padding: '10px 0 4px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sliderMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sliderLabel: {
    color: '#555',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  sliderValue: {
    fontSize: 20,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 0.5,
  },
  slider: {
    width: '100%',
    height: 6,
    cursor: 'pointer',
  },
  typeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  typeLabel: {
    color: '#555',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 2,
    flexShrink: 0,
    width: 50,
  },
  typeSelect: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#ccc',
    fontSize: 18,
    padding: '12px 14px',
    height: 52,
  },
};
