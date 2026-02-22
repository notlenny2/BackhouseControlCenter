import { useRef, useEffect } from 'react';

const pToThr = p => (p ?? 0.5) * 80 - 80;          // 0..1 -> -80..0 dB
const pToRange = p => (p ?? 0.5) * 60;             // 0..1 -> 0..60 dB attenuation
const pToAtt = p => ((p ?? 0) * 200).toFixed(0);   // ms
const pToHold = p => ((p ?? 0) * 2000).toFixed(0); // ms
const pToRel = p => ((p ?? 0) * 3000).toFixed(0);  // ms

function gateOutDb(inDb, thrDb, rangeDb) {
  if (inDb >= thrDb) return inDb;
  return Math.max(-90, inDb - rangeDb);
}

function drawGate(canvas, thrDb, rangeDb) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (!W || !H) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const PAD = 36;
  const cW = W - PAD;
  const cH = H - PAD;
  const MIN_DB = -80;
  const MAX_DB = 0;

  const xToDb = x => MIN_DB + (x / cW) * (MAX_DB - MIN_DB);
  const dbToX = db => PAD + ((db - MIN_DB) / (MAX_DB - MIN_DB)) * cW;
  const dbToY = db => cH - ((db - MIN_DB) / (MAX_DB - MIN_DB)) * cH;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d0d12');
  bg.addColorStop(1, '#080808');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const steps = [-80, -64, -48, -36, -24, -12, 0];
  for (const db of steps) {
    const x = dbToX(db);
    const y = dbToY(db);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH);
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W, y);
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.stroke();
  }

  const tx = dbToX(thrDb);
  ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, cH);
  ctx.strokeStyle = 'rgba(255,140,120,0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,140,120,0.85)';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`T: ${thrDb.toFixed(0)}dB`, Math.min(tx + 4, W - 54), 14);

  const pts = [];
  for (let i = 0; i <= cW; i++) {
    const inDb = xToDb(i);
    const outDb = gateOutDb(inDb, thrDb, rangeDb);
    pts.push({ x: PAD + i, y: dbToY(Math.max(MIN_DB, Math.min(MAX_DB, outDb))) });
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = '#00aaff';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#00aaff';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function MeterBar({ label, value, min, max, color, reverse = false }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillPct = pct * 100;
  return (
    <div style={ms.meterWrap}>
      <span style={ms.meterLabel}>{label}</span>
      <div style={ms.meterTrack}>
        <div style={{
          ...ms.meterFill,
          height: `${fillPct}%`,
          bottom: reverse ? 'auto' : 0,
          top: reverse ? 0 : 'auto',
          background: color,
          boxShadow: `0 0 6px ${color}88`,
        }} />
      </div>
      <span style={ms.meterVal}>{value > min + 0.5 ? `${value >= 0 ? '+' : ''}${value.toFixed(0)}` : '–'}</span>
    </div>
  );
}

function GateSlider({ label, value, accent, param, ch, raw, setGateParam }) {
  return (
    <div style={ps.sliderRow}>
      <div style={ps.sliderMeta}>
        <span style={ps.sliderLabel}>{label}</span>
        <span style={{ ...ps.sliderValue, color: accent }}>{value}</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.001"
        value={raw ?? 0}
        style={{ width: '100%', accentColor: accent, height: 6, cursor: 'pointer' }}
        onChange={e => setGateParam(ch, param, parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function GateCurve({ ch, getGateParam, setGateParam, getMeterLevel }) {
  const canvasRef = useRef(null);

  const on = getGateParam(ch, 'on') ?? 1;
  const thr = getGateParam(ch, 'thr') ?? 0.5;
  const range = getGateParam(ch, 'range') ?? 0.5;
  const att = getGateParam(ch, 'att') ?? 0.1;
  const hold = getGateParam(ch, 'hold') ?? 0.1;
  const rel = getGateParam(ch, 'rel') ?? 0.2;

  const thrDb = pToThr(thr);
  const rangeDb = pToRange(range);
  const attMs = pToAtt(att);
  const holdMs = pToHold(hold);
  const relMs = pToRel(rel);

  const inputLinear = Math.max(0, Math.min(1, getMeterLevel ? getMeterLevel(ch) : 0));
  const hasSignal = inputLinear > 0.002;
  const meterInputDb = hasSignal ? Math.max(-80, Math.min(0, 20 * Math.log10(inputLinear))) : -80;
  const meterGainReduced = hasSignal && meterInputDb < thrDb ? rangeDb : 0;
  const meterOutputDb = hasSignal ? Math.max(-80, Math.min(6, gateOutDb(meterInputDb, thrDb, rangeDb))) : -80;

  useEffect(() => {
    const c = canvasRef.current;
    if (c) drawGate(c, thrDb, rangeDb);
  }, [thrDb, rangeDb]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => drawGate(c, thrDb, rangeDb));
    ro.observe(c);
    return () => ro.disconnect();
  }, [thrDb, rangeDb]);

  const isOn = on >= 0.5;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <button
          style={{
            ...ps.onBtn,
            background: isOn ? '#002800' : '#1a1a1a',
            border: `1px solid ${isOn ? '#00cc44' : '#333'}`,
            color: isOn ? '#00ff55' : '#444',
            boxShadow: isOn ? '0 0 10px rgba(0,200,60,0.35)' : 'none',
          }}
          onClick={() => setGateParam(ch, 'on', isOn ? 0 : 1)}
        >
          {isOn ? '● GATE ON' : '○ GATE OFF'}
        </button>
        <div style={ps.statsRow}>
          <Stat label="THR" value={`${thrDb.toFixed(0)} dB`} />
          <Stat label="RANGE" value={`${rangeDb.toFixed(0)} dB`} />
          <Stat label="REDUCE" value={meterGainReduced > 0 ? `-${meterGainReduced.toFixed(0)} dB` : '—'} color="#ff5544" />
        </div>
      </div>

      <div style={{ ...ps.graphRow, opacity: isOn ? 1 : 0.4, transition: 'opacity 0.2s' }}>
        <div style={ps.graphWrap}>
          <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: '1 / 1', display: 'block' }} />
        </div>
        <div style={ps.meterCol}>
          <MeterBar label="INPUT" value={meterInputDb} min={-80} max={0} color="#2b7dff" />
          <MeterBar label="GR" value={meterGainReduced} min={0} max={60} color="#ff3b30" reverse />
          <MeterBar label="OUTPUT" value={meterOutputDb} min={-80} max={6} color="#22c55e" />
        </div>
      </div>

      <div style={ps.sliders}>
        <GateSlider label="THRESHOLD" value={`${thrDb.toFixed(0)} dB`} accent="#ffaa00"
          param="thr" ch={ch} raw={thr} setGateParam={setGateParam} />
        <GateSlider label="RANGE" value={`${rangeDb.toFixed(0)} dB`} accent="#ff6b6b"
          param="range" ch={ch} raw={range} setGateParam={setGateParam} />
        <GateSlider label="ATTACK" value={`${attMs} ms`} accent="#44ccaa"
          param="att" ch={ch} raw={att} setGateParam={setGateParam} />
        <GateSlider label="HOLD" value={`${holdMs} ms`} accent="#aa88ff"
          param="hold" ch={ch} raw={hold} setGateParam={setGateParam} />
        <GateSlider label="RELEASE" value={`${relMs} ms`} accent="#44ccaa"
          param="rel" ch={ch} raw={rel} setGateParam={setGateParam} />
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
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
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
  meterVal: {
    color: '#666',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
};
