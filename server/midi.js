// midi.js — MIDI output controller
let midi;
try {
  midi = require('@julusian/midi');
} catch (e) {
  console.warn('[MIDI] @julusian/midi not available:', e.message);
  midi = null;
}

class MidiController {
  constructor() {
    this.output = null;
    this.portName = null;
    this.portIndex = -1;
    this._init();
  }

  _init() {
    if (!midi) return;
    try {
      this.output = new midi.Output();
      const count = this.output.getPortCount();
      console.log(`[MIDI] ${count} output port(s) available:`);
      for (let i = 0; i < count; i++) {
        console.log(`  [${i}] ${this.output.getPortName(i)}`);
      }
      if (count > 0) {
        this.portIndex = 0;
        this.portName = this.output.getPortName(0);
        this.output.openPort(0);
        console.log(`[MIDI] Opened port: ${this.portName}`);
      } else {
        // Create virtual MIDI port for testing
        this.output.openVirtualPort('BHP MIDI Out');
        this.portName = 'BHP MIDI Out (virtual)';
        console.log('[MIDI] No hardware ports found. Opened virtual port: BHP MIDI Out');
      }
    } catch (e) {
      console.warn('[MIDI] Init error:', e.message);
      this.output = null;
    }
  }

  getAvailablePorts() {
    if (!midi) return [];
    try {
      const tmp = new midi.Output();
      const ports = [];
      for (let i = 0; i < tmp.getPortCount(); i++) {
        ports.push({ index: i, name: tmp.getPortName(i) });
      }
      tmp.closePort();
      return ports;
    } catch (e) {
      return [];
    }
  }

  openPort(index) {
    if (!this.output) return false;
    try {
      this.output.closePort();
      this.output.openPort(index);
      this.portIndex = index;
      this.portName = this.output.getPortName(index);
      console.log(`[MIDI] Switched to port: ${this.portName}`);
      return true;
    } catch (e) {
      console.error('[MIDI] openPort error:', e.message);
      return false;
    }
  }

  // Send a MIDI cue object: { type, channel, value, cc, note, velocity }
  sendCue(cue) {
    if (!cue || !cue.midi) return;
    this.send(cue.midi);
  }

  send(msg) {
    if (!this.output) {
      console.log('[MIDI] (no output) Would send:', msg);
      return;
    }
    const ch = (msg.channel || 1) - 1; // 0-indexed
    try {
      switch (msg.type) {
        case 'pc': // Program Change
          this.output.sendMessage([0xC0 | ch, msg.value & 0x7F]);
          console.log(`[MIDI] PC ch${ch + 1} prog=${msg.value}`);
          break;
        case 'cc': // Control Change
          this.output.sendMessage([0xB0 | ch, msg.cc & 0x7F, msg.value & 0x7F]);
          console.log(`[MIDI] CC ch${ch + 1} cc=${msg.cc} val=${msg.value}`);
          break;
        case 'note': // Note On
          this.output.sendMessage([0x90 | ch, msg.note & 0x7F, (msg.velocity || 100) & 0x7F]);
          console.log(`[MIDI] NoteOn ch${ch + 1} note=${msg.note} vel=${msg.velocity}`);
          // Auto note-off after 100ms
          setTimeout(() => {
            if (this.output) {
              this.output.sendMessage([0x80 | ch, msg.note & 0x7F, 0]);
            }
          }, 100);
          break;
        case 'noteoff':
          this.output.sendMessage([0x80 | ch, msg.note & 0x7F, 0]);
          break;
        default:
          console.warn('[MIDI] Unknown message type:', msg.type);
      }
    } catch (e) {
      console.error('[MIDI] Send error:', e.message);
    }
  }

  getStatus() {
    return {
      available: !!this.output,
      portName: this.portName,
      portIndex: this.portIndex,
      ports: this.getAvailablePorts()
    };
  }

  close() {
    if (this.output) {
      try { this.output.closePort(); } catch (e) {}
    }
  }
}

module.exports = MidiController;
