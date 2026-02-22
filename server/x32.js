// x32.js — OSC bridge for Behringer X32
// Uses a single dgram socket bound to LOCAL_PORT so the X32 replies
// to the same port we're listening on.
const dgram = require('dgram');

const X32_PORT = 10023;
const LOCAL_PORT = 10024;
const FADER_DEBOUNCE = 50; // ms

// ─── Minimal OSC encoder/decoder ──────────────────────────────────────────────

function padTo4(n) { return Math.ceil(n / 4) * 4; }

function encodeString(str) {
  const len = padTo4(str.length + 1);
  const buf = Buffer.alloc(len);
  buf.write(str, 0, 'ascii');
  return buf;
}

function encodeFloat(val) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(val, 0);
  return buf;
}

// Encode an OSC message: address (string), args (array of {type,value})
function encodeOSC(address, args = []) {
  const addrBuf = encodeString(address);
  const types = ',' + args.map(a => a.type).join('');
  const typeBuf = encodeString(types);
  const argBufs = args.map(a => {
    if (a.type === 'f') return encodeFloat(a.value);
    if (a.type === 's') return encodeString(a.value);
    if (a.type === 'i') {
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(a.value, 0);
      return buf;
    }
    return Buffer.alloc(0);
  });
  return Buffer.concat([addrBuf, typeBuf, ...argBufs]);
}

// Decode an incoming OSC message buffer → { address, args }
function decodeOSC(buf) {
  try {
    let offset = 0;

    // Read address
    const addrEnd = buf.indexOf(0, offset);
    const address = buf.toString('ascii', offset, addrEnd);
    offset = padTo4(addrEnd + 1);

    // Read type tag
    if (offset >= buf.length) return { address, args: [] };
    const typeEnd = buf.indexOf(0, offset);
    const typeTag = buf.toString('ascii', offset, typeEnd);
    offset = padTo4(typeEnd + 1);

    // Parse args
    const args = [];
    for (let i = 1; i < typeTag.length; i++) {
      const t = typeTag[i];
      if (t === 'f') {
        args.push({ type: 'f', value: buf.readFloatBE(offset) });
        offset += 4;
      } else if (t === 's') {
        const end = buf.indexOf(0, offset);
        args.push({ type: 's', value: buf.toString('ascii', offset, end) });
        offset = padTo4(end + 1);
      } else if (t === 'i') {
        args.push({ type: 'i', value: buf.readInt32BE(offset) });
        offset += 4;
      } else if (t === 'b') {
        const blobLen = buf.readInt32BE(offset);
        offset += 4;
        args.push({ type: 'b', value: buf.slice(offset, offset + blobLen) });
        offset += padTo4(blobLen);
      } else {
        break; // unknown type
      }
    }
    return { address, args };
  } catch (e) {
    return null;
  }
}

// ─── X32Bridge ────────────────────────────────────────────────────────────────

class X32Bridge {
  constructor(io) {
    this.io = io;
    this.x32Ip = null;
    this.connected = false;
    this.socket = null;
    this.faderTimers = {};
    this.pendingValues = {};
    this.channelNames = {};
    this.busNames = {};
    this._keepaliveTimer = null;
    this.muteStates = {};
    this.meterPollTimer = null;
  }

  start(configuredIp) {
    this.x32Ip = configuredIp || null;

    this.socket = dgram.createSocket('udp4');

    this.socket.on('error', (err) => {
      console.error('[X32] Socket error:', err.message);
    });

    this.socket.on('message', (buf, rinfo) => {
      const msg = decodeOSC(buf);
      if (msg) this._handleMessage(msg, rinfo);
    });

    this.socket.bind(LOCAL_PORT, () => {
      console.log(`[X32] Listening on port ${LOCAL_PORT}`);
      if (this.x32Ip) {
        console.log(`[X32] Connecting to ${this.x32Ip}:${X32_PORT}`);
        this._sendRaw('/xinfo');
        // Retry every 5s until connected
        this._retryTimer = setInterval(() => {
          if (!this.connected) {
            console.log('[X32] Retrying connection...');
            this._sendRaw('/xinfo');
          } else {
            clearInterval(this._retryTimer);
          }
        }, 5000);
      }
    });
  }

  _handleMessage({ address, args }, rinfo) {
    if (address === '/xinfo') {
      if (!this.connected) {
        // Use reply IP if we didn't have one (discovery mode)
        if (!this.x32Ip) this.x32Ip = rinfo.address;
        this.connected = true;
        const info = args.map(a => a.value).join(' ');
        console.log(`[X32] Connected to ${this.x32Ip} — ${info}`);
        this.io.emit('x32:status', { connected: true, ip: this.x32Ip });
        this._startKeepalive();
        this._startMeterPoll();
        this._fetchAllChannelNames();
      }
      return;
    }

    // Fader level reply: /ch/01/mix/01/level
    const faderMatch = address.match(/^\/ch\/(\d+)\/mix\/(\d+)\/level$/);
    if (faderMatch && args[0]) {
      const channel = parseInt(faderMatch[1]);
      const bus = parseInt(faderMatch[2]);
      const level = args[0].value;
      this.io.emit('x32:fader', { channel, bus, level });
      return;
    }

    // Bus name reply: /bus/01/config/name
    const busNameMatch = address.match(/^\/bus\/(\d+)\/config\/name$/);
    if (busNameMatch) {
      const bus = parseInt(busNameMatch[1]);
      const name = (args[0] && args[0].value) ? args[0].value.replace(/\0/g, '').trim() : '';
      this.busNames[bus] = name;
      this.io.emit('x32:busName', { bus, name });
      return;
    }

    // Channel name reply
    const nameMatch = address.match(/^\/ch\/(\d+)\/config\/name$/);
    if (nameMatch) {
      const channel = parseInt(nameMatch[1]);
      const name = (args[0] && args[0].value) ? args[0].value.replace(/\0/g, '').trim() : '';
      this.channelNames[channel] = name;
      this.io.emit('x32:channelName', { channel, name });
      return;
    }

    // Bus master fader reply: /bus/01/mix/fader
    const busMasterMatch = address.match(/^\/bus\/(\d+)\/mix\/fader$/);
    if (busMasterMatch && args[0]) {
      const bus = parseInt(busMasterMatch[1]);
      this.io.emit('x32:busMaster', { bus, level: args[0].value });
      return;
    }

    // LR main bus fader reply: /lr/mix/fader
    if (address === '/lr/mix/fader' && args[0]) {
      this.io.emit('x32:lr', { level: args[0].value });
      return;
    }

    // Mute state reply: /ch/01/mix/on (1=active, 0=muted)
    const muteMatch = address.match(/^\/ch\/(\d+)\/mix\/on$/);
    if (muteMatch && args[0] !== undefined) {
      const channel = parseInt(muteMatch[1]);
      const on = args[0].value;
      this.muteStates[channel] = on;
      this.io.emit('x32:mute', { channel, on });
      return;
    }

    // EQ parameter reply: /ch/01/eq/1/g
    const eqMatch = address.match(/^\/ch\/(\d+)\/eq\/(\d+)\/(type|f|g|q)$/);
    if (eqMatch && args[0] !== undefined) {
      const channel = parseInt(eqMatch[1]);
      const band = parseInt(eqMatch[2]);
      const param = eqMatch[3];
      this.io.emit('x32:eq', { channel, band, param, value: args[0].value });
      return;
    }

    // Dynamics parameter reply: /ch/01/dyn/thr
    const dynMatch = address.match(/^\/ch\/(\d+)\/dyn\/(on|thr|ratio|att|rel|knee|gain)$/);
    if (dynMatch && args[0] !== undefined) {
      const channel = parseInt(dynMatch[1]);
      const param = dynMatch[2];
      this.io.emit('x32:dyn', { channel, param, value: args[0].value });
      return;
    }

    // Gate parameter reply: /ch/01/gate/thr
    const gateMatch = address.match(/^\/ch\/(\d+)\/gate\/(on|thr|range|att|hold|rel)$/);
    if (gateMatch && args[0] !== undefined) {
      const channel = parseInt(gateMatch[1]);
      const param = gateMatch[2];
      this.io.emit('x32:gate', { channel, param, value: args[0].value });
      return;
    }

    // Channel send on/off reply: /ch/01/mix/01/on
    const sendOnMatch = address.match(/^\/ch\/(\d+)\/mix\/(\d+)\/on$/);
    if (sendOnMatch && args[0] !== undefined) {
      const channel = parseInt(sendOnMatch[1]);
      const bus = parseInt(sendOnMatch[2]);
      this.io.emit('x32:sendOn', { channel, bus, on: args[0].value });
      return;
    }

    // Meter data: /meters/0 — blob of 32-bit floats, one per input channel
    if (address === '/meters/0') {
      const blobArg = args.find(a => a.type === 'b');
      if (blobArg) {
        const blob = blobArg.value;

        // Format: LE int32 count, then count × LE float32 channel levels (0–1 linear amplitude)
        const count = blob.readInt32LE(0);
        const numFloats = Math.min(count, 32);
        const levels = [];
        for (let i = 0; i < numFloats; i++) {
          const f = blob.readFloatLE(4 + i * 4);
          levels.push(isFinite(f) ? Math.max(0, Math.min(1, f)) : 0);
        }
        this.io.emit('x32:meters', { channels: levels });
      }
      return;
    }
  }

  _sendRaw(address, args = []) {
    if (!this.socket || !this.x32Ip) return;
    try {
      const buf = encodeOSC(address, args);
      this.socket.send(buf, X32_PORT, this.x32Ip);
    } catch (e) {
      console.error('[X32] Send error:', e.message);
    }
  }

  _startMeterPoll() {
    if (this.meterPollTimer) clearInterval(this.meterPollTimer);
    // Ask the X32 for channel input meter snapshot every 80 ms
    const poll = () => {
      if (this.connected) this._sendRaw('/meters', [{ type: 's', value: '/meters/0' }]);
    };
    poll();
    this.meterPollTimer = setInterval(poll, 80);
  }

  _startKeepalive() {
    if (this._keepaliveTimer) clearInterval(this._keepaliveTimer);
    // /xremote keeps the X32 sending us value updates for 10s — renew every 8s
    this._sendRaw('/xremote');
    this._keepaliveTimer = setInterval(() => {
      if (this.connected) {
        this._sendRaw('/xremote');
      }
    }, 8000);
  }

  _fetchAllChannelNames() {
    for (let ch = 1; ch <= 32; ch++) {
      const pad = String(ch).padStart(2, '0');
      setTimeout(() => {
        this._sendRaw(`/ch/${pad}/config/name`);
      }, ch * 40);
    }
    // Fetch bus names (1-16) after channel names
    for (let b = 1; b <= 16; b++) {
      const pad = String(b).padStart(2, '0');
      setTimeout(() => {
        this._sendRaw(`/bus/${pad}/config/name`);
      }, (32 + b) * 40);
    }
    // Also fetch LR fader on connect
    setTimeout(() => this._sendRaw('/lr/mix/fader'), (32 + 16 + 1) * 40);
  }

  setFader(channel, bus, level) {
    const key = `${channel}_${bus}`;
    this.pendingValues[key] = { channel, bus, level };
    if (this.faderTimers[key]) return;
    this.faderTimers[key] = setTimeout(() => {
      delete this.faderTimers[key];
      const v = this.pendingValues[key];
      if (!v) return;
      delete this.pendingValues[key];
      const chPad = String(v.channel).padStart(2, '0');
      const busPad = String(v.bus).padStart(2, '0');
      this._sendRaw(`/ch/${chPad}/mix/${busPad}/level`, [{ type: 'f', value: v.level }]);
    }, FADER_DEBOUNCE);
  }

  getFader(channel, bus) {
    const chPad = String(channel).padStart(2, '0');
    const busPad = String(bus).padStart(2, '0');
    this._sendRaw(`/ch/${chPad}/mix/${busPad}/level`);
  }

  requestFaderState(faders, bus) {
    faders.forEach(({ channel }, i) => {
      setTimeout(() => this.getFader(channel, bus), i * 20);
    });
  }

  sendOSC(address, args = []) {
    this._sendRaw(address, args);
  }

  setBusMasterFader(bus, level) {
    const busPad = String(bus).padStart(2, '0');
    this._sendRaw(`/bus/${busPad}/mix/fader`, [{ type: 'f', value: level }]);
  }

  getBusMasterFader(bus) {
    const busPad = String(bus).padStart(2, '0');
    this._sendRaw(`/bus/${busPad}/mix/fader`);
  }

  setLRFader(level) {
    this._sendRaw('/lr/mix/fader', [{ type: 'f', value: level }]);
  }

  getLRFader() {
    this._sendRaw('/lr/mix/fader');
  }

  getAllChannelNames() {
    return this.channelNames;
  }

  getAllBusNames() {
    return this.busNames;
  }

  setX32Ip(ip) {
    this.x32Ip = ip;
    this.connected = false;
    this._sendRaw('/xinfo');
  }

  getStatus() {
    return { connected: this.connected, ip: this.x32Ip };
  }

  getMute(channel) {
    const pad = String(channel).padStart(2, '0');
    this._sendRaw(`/ch/${pad}/mix/on`);
  }

  setMute(channel, muted) {
    const pad = String(channel).padStart(2, '0');
    const on = muted ? 0 : 1;
    this._sendRaw(`/ch/${pad}/mix/on`, [{ type: 'i', value: on }]);
    this.muteStates[channel] = on;
    this.io.emit('x32:mute', { channel, on });
  }

  getEQ(channel) {
    const pad = String(channel).padStart(2, '0');
    let delay = 0;
    for (let band = 1; band <= 4; band++) {
      for (const param of ['type', 'f', 'g', 'q']) {
        setTimeout(() => this._sendRaw(`/ch/${pad}/eq/${band}/${param}`), delay);
        delay += 20;
      }
    }
  }

  setEqParam(channel, band, param, value) {
    const pad = String(channel).padStart(2, '0');
    const type = param === 'type' ? 'i' : 'f';
    this._sendRaw(`/ch/${pad}/eq/${band}/${param}`, [{ type, value }]);
  }

  getDynParams(channel) {
    const pad = String(channel).padStart(2, '0');
    ['on', 'thr', 'ratio', 'att', 'rel', 'knee', 'gain'].forEach((param, i) => {
      setTimeout(() => this._sendRaw(`/ch/${pad}/dyn/${param}`), i * 20);
    });
  }

  setDynParam(channel, param, value) {
    const pad = String(channel).padStart(2, '0');
    const type = param === 'on' ? 'i' : 'f';
    this._sendRaw(`/ch/${pad}/dyn/${param}`, [{ type, value }]);
  }

  getGateParams(channel) {
    const pad = String(channel).padStart(2, '0');
    ['on', 'thr', 'range', 'att', 'hold', 'rel'].forEach((param, i) => {
      setTimeout(() => this._sendRaw(`/ch/${pad}/gate/${param}`), i * 20);
    });
  }

  setGateParam(channel, param, value) {
    const pad = String(channel).padStart(2, '0');
    const type = param === 'on' ? 'i' : 'f';
    this._sendRaw(`/ch/${pad}/gate/${param}`, [{ type, value }]);
  }

  getChannelSends(channel) {
    const chPad = String(channel).padStart(2, '0');
    for (let bus = 1; bus <= 16; bus++) {
      const busPad = String(bus).padStart(2, '0');
      const delay = (bus - 1) * 25;
      setTimeout(() => {
        this._sendRaw(`/ch/${chPad}/mix/${busPad}/level`);
        this._sendRaw(`/ch/${chPad}/mix/${busPad}/on`);
      }, delay);
    }
  }

  requestChannelDetail(channel) {
    this.getMute(channel);
    setTimeout(() => this.getEQ(channel), 30);
    setTimeout(() => this.getDynParams(channel), 430);
    setTimeout(() => this.getGateParams(channel), 560);
    setTimeout(() => this.getChannelSends(channel), 760);
  }
}

module.exports = X32Bridge;
