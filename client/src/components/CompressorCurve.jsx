// CompressorCurve.jsx — Visual compressor display with transfer curve + GR/level meters
import { useRef, useEffect, useCallback, useMemo } from 'react';

// ─── X32 param → value conversions ───────────────────────────────────────────
const pToThr   = p  => (p  ?? 0.5) * 60 - 60;          // 0→-60dB, 1→0dB
const pToRatio = p  => 1 + (p ?? 0) * 99;              // 0→1:1,  1→100:1
const pToKnee  = p  => (p  ?? 0) * 20;                 // 0→0dB,  1→20dB
const pToAtt   = p  => ((p ?? 0) * 200).toFixed(0);    // ms
const pToRel   = p  => ((p ?? 0) * 2000).toFixed(0);   // ms
const pToMGain = p  => ((p ?? 0) * 24).toFixed(1);     // dB

// ─── Compressor gain-computer (standard soft-knee formula) ────────────────────
function gainComputer(x, T, R, W) {
  if (2 * (x - T) < -W)          return x;               // below knee
  if (2 * Math.abs(x - T) <= W)  return x + (1 / R - 1) * Math.pow(x - T + W / 2, 2) / (2 * W); // knee
  return T + (x - T) / R;                                 // above threshold
}

// ─── Draw transfer curve canvas ───────────────────────────────────────────────
function drawComp(canvas, thrDb, ratio, kneeDb, mgDb) {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth;
  const H   = canvas.offsetHeight;
  if (!W || !H) return;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const PAD = 36; // axis labels
  const cW  = W - PAD;
  const cH  = H - PAD;
  const MIN_DB = -60, MAX_DB = 0;

  const xToDb  = x  => MIN_DB + (x / cW) * (MAX_DB - MIN_DB);
  const dbToX  = db => PAD + ((db - MIN_DB) / (MAX_DB - MIN_DB)) * cW;
  const dbToY  = db => cH - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * cH;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d0d12');
  bg.addColorStop(1, '#080808');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Grid ──────────────────────────────────────────────────────────────────
  const DB_STEPS = [-60, -48, -36, -24, -18, -12, -6, 0];
  for (const db of DB_STEPS) {
    const x = dbToX(db);
    const y = dbToY(db);
    // Vertical
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH);
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1; ctx.stroke();
    // Horizontal
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W, y);
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.stroke();
    // Labels
    if (db % 12 === 0 || db === -6) {
      ctx.fillStyle = '#3a3a3a'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${db}`, x, H - 4);
      if (db > MIN_DB) {
        ctx.textAlign = 'right';
        ctx.fillText(`${db}`, PAD - 4, y + 4);
      }
    }
  }

  // Axis labels
  ctx.fillStyle = '#444'; ctx.font = '10px monospace';
  ctx.textAlign = 'center'; ctx.fillText('INPUT (dBFS)', PAD + cW / 2, H - 0);
  ctx.save();
  ctx.translate(10, cH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('OUTPUT (dBFS)', 0, 0); ctx.restore();

  // ── Threshold zone ────────────────────────────────────────────────────────
  const txStart = dbToX(Math.max(MIN_DB, thrDb - kneeDb / 2));
  const txEnd   = dbToX(Math.min(MAX_DB, thrDb + kneeDb / 2));
  ctx.fillStyle = 'rgba(255,170,0,0.06)';
  ctx.fillRect(txStart, 0, txEnd - txStart, cH);

  // Threshold line
  const tx = dbToX(thrDb);
  ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, cH);
  ctx.strokeStyle = 'rgba(255,170,0,0.35)';
  ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,170,0,0.7)';
  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`T: ${thrDb.toFixed(0)}dB`, Math.min(tx + 4, W - 50), 14);

  // ── Unity line (no compression reference) ─────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(dbToX(MIN_DB), dbToY(MIN_DB));
  ctx.lineTo(dbToX(MAX_DB), dbToY(MAX_DB));
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1; ctx.stroke();

  // ── Compression curve ─────────────────────────────────────────────────────
  const pts = [];
  for (let i = 0; i <= cW; i++) {
    const inDb  = xToDb(i);
    const outDb = gainComputer(inDb, thrDb, ratio, kneeDb) + mgDb;
    pts.push({ x: PAD + i, y: dbToY(Math.max(MIN_DB, Math.min(MAX_DB + 6, outDb))) });
  }

  // Fill between curve and unity line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(dbToX(MAX_DB), dbToY(MIN_DB));
  ctx.lineTo(dbToX(MIN_DB), dbToY(MIN_DB));
  ctx.closePath();
  const fillG = ctx.createLinearGradient(PAD, 0, W, 0);
  fillG.addColorStop(0,   'rgba(0,170,255,0.04)');
  fillG.addColorStop(0.7, 'rgba(0,170,255,0.12)');
  fillG.addColorStop(1,   'rgba(0,170,255,0.20)');
  ctx.fillStyle = fillG;
  ctx.fill();

  // Curve line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = '#00aaff';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 8;
  ctx.stroke(); ctx.shadowBlur = 0;

  // Makeup gain offset label
  if (Math.abs(mgDb) > 0.1) {
    ctx.fillStyle = 'rgba(0,255,136,0.7)';
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`MG: +${mgDb}dB`, W - 4, 14);
  }

  // ── GR range indicator (right edge, shows max GR at 0dBFS) ───────────────
  const grAtZero = gainComputer(0, thrDb, ratio, kneeDb) - 0; // negative = reduction
  if (grAtZero < -0.1) {
    const grY    = dbToY(grAtZero);
    const zeroY  = dbToY(0);
    ctx.fillStyle = 'rgba(255,80,80,0.15)';
    ctx.fillRect(W - 8, grY, 6, zeroY - grY);
    ctx.fillStyle = 'rgba(255,80,80,0.8)';
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`GR: ${grAtZero.toFixed(0)}dB`, W - 12, grY - 3);
  }
}

// ─── Vertical meter bar ───────────────────────────────────────────────────────
function MeterBar({ label, value, min, max, color, dimColor, unit = 'dB', reverse = false }) {
  // value is in dB, min/max define the range
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillPct = pct * 100;

  return (
    <div style={ms.meterWrap}>
      <span style={ms.meterLabel}>{label}</span>
      <div style={ms.meterTrack}>
        {/* Colored fill */}
        <div style={{
          ...ms.meterFill,
          height: `${fillPct}%`,
          bottom: reverse ? 'auto' : 0,
          top: reverse ? 0 : 'auto',
          background: color,
          boxShadow: `0 0 6px ${color}88`,
        }} />
        {/* Tick marks */}
        {[-6, -12, -18, -24, -36].map(db => {
          const p = (db - min) / (max - min);
          return (
            <div key={db} style={{ ...ms.tick, bottom: `${p * 100}%` }} />
          );
        })}
      </div>
      <span style={ms.meterVal}>{value > min + 0.5 ? `${value >= 0 ? '+' : ''}${value.toFixed(0)}` : '–'}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CompressorCurve({ ch, getDynParam, setDynParam, getMeterLevel }) {
  const canvasRef = useRef(null);

  const thr   = getDynParam(ch, 'thr')   ?? 0.5;
  const ratio = getDynParam(ch, 'ratio') ?? 0.1;
  const knee  = getDynParam(ch, 'knee')  ?? 0.2;
  const att   = getDynParam(ch, 'att')   ?? 0.1;
  const rel   = getDynParam(ch, 'rel')   ?? 0.15;
  const gain  = getDynParam(ch, 'gain')  ?? 0;
  const on    = getDynParam(ch, 'on')    ?? 1;

  const thrDb   = pToThr(thr);
  const ratioV  = pToRatio(ratio);
  const kneeDb  = pToKnee(knee);
  const mgDb    = parseFloat(pToMGain(gain));

  // Derived stats
  const grMax  = Math.max(0, -(gainComputer(0, thrDb, ratioV, kneeDb)));
  const ratioStr = ratioV > 50 ? '∞ : 1' : `${ratioV.toFixed(1)} : 1`;
  const attMs  = pToAtt(att);
  const relMs  = pToRel(rel);
  const inputLinear = Math.max(0, Math.min(1, getMeterLevel ? getMeterLevel(ch) : 0));
  const hasSignal = inputLinear > 0.002;
  const meterInputDb = hasSignal ? Math.max(-60, Math.min(0, 20 * Math.log10(inputLinear))) : -60;
  const compOutputDbNoMakeup = hasSignal ? gainComputer(meterInputDb, thrDb, ratioV, kneeDb) : -60;
  const meterGainReduced = hasSignal ? Math.max(0, meterInputDb - compOutputDbNoMakeup) : 0;
  const meterOutputDb = hasSignal ? Math.max(-60, Math.min(6, compOutputDbNoMakeup + mgDb)) : -60;

  useEffect(() => {
    const c = canvasRef.current;
    if (c) drawComp(c, thrDb, ratioV, kneeDb, mgDb);
  }, [thrDb, ratioV, kneeDb, mgDb]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => drawComp(c, thrDb, ratioV, kneeDb, mgDb));
    ro.observe(c);
    return () => ro.disconnect();
  }, [thrDb, ratioV, kneeDb, mgDb]);

  const isOn = on >= 0.5;

  return (
    <div>
      {/* ON/OFF badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <button
          style={{
            ...ps.onBtn,
            background: isOn ? '#002800' : '#1a1a1a',
            border: `1px solid ${isOn ? '#00cc44' : '#333'}`,
            color: isOn ? '#00ff55' : '#444',
            boxShadow: isOn ? '0 0 10px rgba(0,200,60,0.35)' : 'none',
          }}
          onClick={() => setDynParam(ch, 'on', isOn ? 0 : 1)}
        >
          {isOn ? '● COMP ON' : '○ COMP OFF'}
        </button>
        <div style={ps.statsRow}>
          <Stat label="THR"   value={`${thrDb.toFixed(0)} dB`} />
          <Stat label="RATIO" value={ratioStr} />
          <Stat label="GR MAX" value={grMax > 0.1 ? `-${grMax.toFixed(0)} dB` : '—'} color="#ff5544" />
        </div>
      </div>

      {/* Transfer curve canvas */}
      <div style={{ ...ps.graphRow, opacity: isOn ? 1 : 0.4, transition: 'opacity 0.2s' }}>
        <div style={ps.graphWrap}>
          <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: '1 / 1', display: 'block' }} />
        </div>
        <div style={ps.meterCol}>
          <MeterBar label="INPUT" value={meterInputDb} min={-60} max={0} color="#2b7dff" />
          <MeterBar label="GR" value={meterGainReduced} min={0} max={24} color="#ff3b30" reverse />
          <MeterBar label="OUTPUT" value={meterOutputDb} min={-60} max={6} color="#22c55e" />
        </div>
      </div>

      {/* Parameter sliders */}
      <div style={ps.sliders}>
        <CompSlider label="THRESHOLD" value={`${thrDb.toFixed(0)} dB`}   accent="#ffaa00"
          param="thr"   ch={ch} raw={thr}   getDynParam={getDynParam} setDynParam={setDynParam} />
        <CompSlider label="RATIO"     value={ratioStr}                    accent="#00aaff"
          param="ratio" ch={ch} raw={ratio} getDynParam={getDynParam} setDynParam={setDynParam} />
        <CompSlider label="KNEE"      value={`${kneeDb.toFixed(1)} dB`}  accent="#aa88ff"
          param="knee"  ch={ch} raw={knee}  getDynParam={getDynParam} setDynParam={setDynParam} />
        <CompSlider label="ATTACK"    value={`${attMs} ms`}              accent="#44ccaa"
          param="att"   ch={ch} raw={att}   getDynParam={getDynParam} setDynParam={setDynParam} />
        <CompSlider label="RELEASE"   value={`${relMs} ms`}              accent="#44ccaa"
          param="rel"   ch={ch} raw={rel}   getDynParam={getDynParam} setDynParam={setDynParam} />
        <CompSlider label="MAKEUP"    value={`+${mgDb.toFixed(1)} dB`}  accent="#00ff88"
          param="gain"  ch={ch} raw={gain}  getDynParam={getDynParam} setDynParam={setDynParam} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={ps.stat}>
      <span style={ps.statLabel}>{label}</span>
      <span style={{ ...ps.statValue, color: color || '#ccc' }}>{value}</span>
    </div>
  );
}

function CompSlider({ label, value, accent, param, ch, raw, setDynParam }) {
  return (
    <div style={ps.sliderRow}>
      <div style={ps.sliderMeta}>
        <span style={ps.sliderLabel}>{label}</span>
        <span style={{ ...ps.sliderValue, color: accent }}>{value}</span>
      </div>
      <input type="range" min="0" max="1" step="0.001"
        value={raw ?? 0}
        style={{ width: '100%', accentColor: accent, height: 6, cursor: 'pointer' }}
        onChange={e => setDynParam(ch, param, parseFloat(e.target.value))}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ps = {
  onBtn: {
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1.5,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s',
  },
  statsRow: {
    display: 'flex',
    gap: 16,
    flex: 1,
    flexWrap: 'wrap',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statLabel: {
    color: '#444',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  sliders: {
    marginTop: 20,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 14,
  },
  sliderRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
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
    fontSize: 16,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  graphRow: {
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 12,
  },
  graphWrap: {
    width: '100%',
    maxWidth: 450,
    margin: 0,
    flexShrink: 1,
  },
  meterCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    alignItems: 'stretch',
    minWidth: 120,
  },
};

const ms = {
  meterWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  meterLabel: {
    color: '#555',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  meterTrack: {
    width: 22,
    flex: 1,
    background: '#111',
    border: '1px solid #222',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  meterFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    transition: 'height 0.08s ease-out',
  },
  tick: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    background: 'rgba(255,255,255,0.08)',
    pointerEvents: 'none',
  },
  meterVal: {
    color: '#666',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
};
