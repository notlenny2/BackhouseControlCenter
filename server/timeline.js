// timeline.js — BPM clock + cue sequencer
const { EventEmitter } = require('events');

class Timeline extends EventEmitter {
  constructor() {
    super();
    this.bpm = 120;
    this.running = false;
    this.bar = 1;
    this.beat = 1;
    this.beatsPerBar = 4;
    this.cues = [];
    this.firedCues = new Set();
    this._ticker = null;
    this._startTime = null;
    this._pausedAt = null;
    this._elapsedBeats = 0;
  }

  loadShow(showData) {
    this.cues = showData.cues || [];
    this.bpm = showData.bpm || 120;
    this.reset();
    console.log(`[Timeline] Loaded show "${showData.name}" — ${this.cues.length} cues @ ${this.bpm} BPM`);
  }

  setBpm(bpm) {
    const wasRunning = this.running;
    if (wasRunning) {
      // Save elapsed beats before changing tempo
      this._elapsedBeats = this._getElapsedBeats();
      this._startTime = Date.now();
    }
    this.bpm = Math.max(20, Math.min(300, bpm));
    this.emit('bpm', this.bpm);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._startTime = Date.now();
    this._tick();
    console.log('[Timeline] Started');
    this.emit('state', this._getState());
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this._elapsedBeats = this._getElapsedBeats();
    if (this._ticker) {
      clearTimeout(this._ticker);
      this._ticker = null;
    }
    console.log('[Timeline] Stopped');
    this.emit('state', this._getState());
  }

  reset() {
    this.stop();
    this._elapsedBeats = 0;
    this._startTime = null;
    this.bar = 1;
    this.beat = 1;
    this.firedCues = new Set();
    console.log('[Timeline] Reset');
    this.emit('state', this._getState());
  }

  toggle() {
    this.running ? this.stop() : this.start();
  }

  jumpToBar(bar) {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this._elapsedBeats = Math.max(0, (bar - 1) * this.beatsPerBar);
    // Unfired cues before this position should be marked as skipped
    this.firedCues = new Set(
      this.cues
        .filter(c => this._cueBeats(c) < this._elapsedBeats)
        .map(c => c.id)
    );
    if (wasRunning) this.start();
    this.emit('state', this._getState());
  }

  fireCue(cueId) {
    const cue = this.cues.find(c => c.id === cueId);
    if (cue) {
      this.firedCues.add(cueId);
      this.emit('cue', cue);
    }
  }

  _cueBeats(cue) {
    return (cue.bar - 1) * this.beatsPerBar + (cue.beat - 1);
  }

  _getElapsedBeats() {
    if (!this._startTime) return this._elapsedBeats;
    const elapsedMs = Date.now() - this._startTime;
    const beatDurationMs = 60000 / this.bpm;
    return this._elapsedBeats + (elapsedMs / beatDurationMs);
  }

  _tick() {
    if (!this.running) return;

    const totalBeats = this._getElapsedBeats();
    const beatIndex = Math.floor(totalBeats);
    this.bar = Math.floor(beatIndex / this.beatsPerBar) + 1;
    this.beat = (beatIndex % this.beatsPerBar) + 1;

    // Check for cues to fire
    for (const cue of this.cues) {
      if (!this.firedCues.has(cue.id)) {
        const cueBeat = this._cueBeats(cue);
        if (totalBeats >= cueBeat) {
          this.firedCues.add(cue.id);
          console.log(`[Timeline] Firing cue: ${cue.label} (bar ${cue.bar}:${cue.beat})`);
          this.emit('cue', cue);
        }
      }
    }

    this.emit('tick', { bar: this.bar, beat: this.beat, totalBeats });

    // Schedule next tick — aim for 25ms resolution (40fps)
    const beatDurationMs = 60000 / this.bpm;
    const currentFractionalBeat = totalBeats - Math.floor(totalBeats);
    const msToNextBeat = (1 - currentFractionalBeat) * beatDurationMs;
    const tickInterval = Math.min(msToNextBeat, 25);

    this._ticker = setTimeout(() => this._tick(), tickInterval);
  }

  _getState() {
    return {
      running: this.running,
      bpm: this.bpm,
      bar: this.bar,
      beat: this.beat,
      beatsPerBar: this.beatsPerBar,
      cues: this.cues,
      firedCues: Array.from(this.firedCues)
    };
  }

  getState() {
    return this._getState();
  }
}

module.exports = Timeline;
