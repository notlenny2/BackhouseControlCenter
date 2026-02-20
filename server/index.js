// index.js — BHP Server entry point
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const open = require('open');
const multer = require('multer');

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bhp2024';

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// In-memory sessions: token → { name, role }
const sessions = new Map();

function createSession(name, role) {
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, { name, role });
  return token;
}

function validateSession(token) {
  return sessions.get(token) || null;
}

const X32Bridge = require('./x32');
const MidiController = require('./midi');
const OBSController = require('./obs');
const Timeline = require('./timeline');

const PORT = process.env.PORT || 3000;
const CONFIG_DIR = path.join(__dirname, 'config');
const SHOWS_DIR = path.join(CONFIG_DIR, 'shows');
const LYRICS_DIR = path.join(CONFIG_DIR, 'lyrics');
const SETLIST_FILE = path.join(CONFIG_DIR, 'setlist.json');
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');
const SERVER_CONFIG_FILE = path.join(CONFIG_DIR, 'server.json');
const AUDIO_DIR = path.join(__dirname, 'audio');
const CLIENT_BUILD = path.join(__dirname, '..', 'client', 'dist');

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ─── App setup ───────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());

// ─── Audio file upload (multer) ───────────────────────────────────────────────

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aiff', '.aif', '.ogg', '.m4a', '.aac', '.flac']);

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: AUDIO_DIR,
    filename: (req, file, cb) => {
      // Sanitize filename — keep original name but strip path traversal chars
      const safe = file.originalname.replace(/[^a-zA-Z0-9._\- ]/g, '_');
      cb(null, safe);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, AUDIO_EXTS.has(ext));
  },
  limits: { fileSize: 300 * 1024 * 1024 }, // 300 MB per file
});

// Serve audio files statically
app.use('/audio', express.static(AUDIO_DIR));

// ─── Services ─────────────────────────────────────────────────────────────────

const x32 = new X32Bridge(io);
const midi = new MidiController();
const obs = new OBSController(io);
const timeline = new Timeline();

// ─── Config helpers ───────────────────────────────────────────────────────────

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function listShows() {
  try {
    return fs.readdirSync(SHOWS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch { return []; }
}

function loadShow(name) {
  const file = path.join(SHOWS_DIR, `${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function saveShow(name, data) {
  const file = path.join(SHOWS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function listLyrics() {
  try {
    return fs.readdirSync(LYRICS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch { return []; }
}

function loadLyrics(name) {
  const file = path.join(LYRICS_DIR, `${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}

function loadServerConfig() {
  try {
    return JSON.parse(fs.readFileSync(SERVER_CONFIG_FILE, 'utf8'));
  } catch {
    return {
      x32Ip: process.env.X32_IP || '192.168.77.245',
      obsHost: process.env.OBS_HOST || 'localhost',
      obsPort: parseInt(process.env.OBS_PORT) || 4455,
      obsPassword: process.env.OBS_PASSWORD || '',
      midiPortIndex: 0,
    };
  }
}

function saveServerConfig(cfg) {
  fs.writeFileSync(SERVER_CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function loadSetlist() {
  try {
    return JSON.parse(fs.readFileSync(SETLIST_FILE, 'utf8'));
  } catch { return []; }
}

function saveSetlist(songs) {
  fs.writeFileSync(SETLIST_FILE, JSON.stringify(songs, null, 2));
}

// ─── Resolve OSC cue preset → array of { address, args } messages ─────────────

function resolveCueOsc(osc) {
  if (!osc || !osc.preset) return [];
  const pad = (n) => String(n).padStart(2, '0');
  const levelToFloat = (pct) => Math.max(0, Math.min(1, (pct ?? 75) / 100));
  const onVal = (action) => ({ type: 'i', value: action === 'unmute' ? 1 : 0 });

  switch (osc.preset) {
    case 'scene_recall': {
      const idx = Math.max(0, (osc.scene || 1) - 1); // X32 scenes are 0-indexed
      return [
        { address: '/-show/showfile/scene/index', args: [{ type: 'i', value: idx }] },
        { address: '/-show/showfile/scene/go',    args: [] },
      ];
    }
    case 'ch_mute':
      return [{ address: `/ch/${pad(osc.channel || 1)}/mix/on`, args: [onVal(osc.action)] }];
    case 'ch_fader':
      return [{ address: `/ch/${pad(osc.channel || 1)}/mix/fader`, args: [{ type: 'f', value: levelToFloat(osc.level) }] }];
    case 'bus_mute':
      return [{ address: `/bus/${pad(osc.bus || 1)}/mix/on`, args: [onVal(osc.action)] }];
    case 'bus_fader':
      return [{ address: `/bus/${pad(osc.bus || 1)}/mix/fader`, args: [{ type: 'f', value: levelToFloat(osc.level) }] }];
    case 'dca_mute':
      return [{ address: `/dca/${osc.dca || 1}/on`, args: [onVal(osc.action)] }];
    case 'dca_fader':
      return [{ address: `/dca/${osc.dca || 1}/fader`, args: [{ type: 'f', value: levelToFloat(osc.level) }] }];
    case 'lr_fader':
      return [{ address: '/main/st/mix/fader', args: [{ type: 'f', value: levelToFloat(osc.level) }] }];
    case 'lr_mute':
      return [{ address: '/main/st/mix/on', args: [onVal(osc.action)] }];
    case 'custom':
      if (!osc.customAddress) return [];
      return [{ address: osc.customAddress, args: osc.customArgs || [] }];
    default:
      return [];
  }
}

// ─── Timeline events → MIDI + X32 OSC + broadcast ────────────────────────────

timeline.on('cue', (cue) => {
  io.emit('timeline:cue', cue);
  if (cue.midi) midi.send(cue.midi);
  if (cue.osc) {
    const messages = resolveCueOsc(cue.osc);
    messages.forEach((msg, i) => {
      // Small stagger so multi-message cues (scene recall) don't race
      setTimeout(() => x32.sendOSC(msg.address, msg.args), i * 15);
    });
  }
});

timeline.on('tick', (tick) => {
  io.emit('timeline:tick', tick);
});

timeline.on('state', (state) => {
  io.emit('timeline:state', state);
});

// ─── REST endpoints ───────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    x32: x32.getStatus(),
    midi: midi.getStatus(),
    obs: obs.getStatus(),
    timeline: timeline.getState()
  });
});

app.get('/api/shows', (req, res) => res.json(listShows()));
app.get('/api/shows/:name', (req, res) => {
  const show = loadShow(req.params.name);
  show ? res.json(show) : res.status(404).json({ error: 'Show not found' });
});
app.post('/api/shows/:name', (req, res) => {
  saveShow(req.params.name, req.body);
  res.json({ success: true });
});

app.get('/api/setlist', (req, res) => res.json(loadSetlist()));

app.get('/api/lyrics', (req, res) => res.json(listLyrics()));
app.get('/api/lyrics/:name', (req, res) => {
  const lyrics = loadLyrics(req.params.name);
  lyrics ? res.json(lyrics) : res.status(404).json({ error: 'Lyrics not found' });
});
app.post('/api/lyrics/:name', (req, res) => {
  const file = path.join(LYRICS_DIR, `${req.params.name}.json`);
  fs.writeFileSync(file, JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.get('/api/users', (req, res) => res.json(loadUsers()));
app.post('/api/users/:name', (req, res) => {
  const users = loadUsers();
  users[req.params.name] = req.body;
  saveUsers(users);
  res.json({ success: true });
});

// ─── Audio file management ────────────────────────────────────────────────────

app.get('/api/audio', (req, res) => {
  try {
    const files = fs.readdirSync(AUDIO_DIR)
      .filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
      .map(f => {
        const stat = fs.statSync(path.join(AUDIO_DIR, f));
        return { name: f, size: stat.size, modified: stat.mtime };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(files);
  } catch {
    res.json([]);
  }
});

app.post('/api/audio', audioUpload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No audio files received' });
  }
  const uploaded = req.files.map(f => f.filename);
  console.log(`[Audio] Uploaded: ${uploaded.join(', ')}`);
  res.json({ uploaded });
});

app.delete('/api/audio/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filepath = path.join(AUDIO_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
  fs.unlinkSync(filepath);
  console.log(`[Audio] Deleted: ${filename}`);
  res.json({ success: true });
});

// ─── Socket.io event handlers ─────────────────────────────────────────────────

io.on('connection', (socket) => {
  const addr = socket.handshake.address;
  console.log(`[Socket] Client connected: ${socket.id} from ${addr}`);

  // Send current state on connect
  socket.emit('x32:status', x32.getStatus());
  socket.emit('obs:status', obs.getStatus());
  socket.emit('timeline:state', timeline.getState());
  socket.emit('midi:status', midi.getStatus());

  // Client can request a full status refresh at any time
  socket.on('status:request', () => {
    socket.emit('x32:status', x32.getStatus());
    socket.emit('obs:status', obs.getStatus());
    socket.emit('timeline:state', timeline.getState());
    socket.emit('midi:status', midi.getStatus());
    // Send cached channel names
    const names = x32.getAllChannelNames();
    Object.entries(names).forEach(([ch, name]) => {
      socket.emit('x32:channelName', { channel: parseInt(ch), name });
    });
    // Send cached bus names
    const busNames = x32.getAllBusNames();
    Object.entries(busNames).forEach(([b, name]) => {
      socket.emit('x32:busName', { bus: parseInt(b), name });
    });
    // Send current LR level
    x32.getLRFader();
    // Send current setlist
    socket.emit('setlist:data', loadSetlist());
  });

  // ── X32 / Monitor Mix ──
  socket.on('x32:setFader', ({ channel, bus, level }) => {
    x32.setFader(channel, bus, level);
    // Echo to all other clients so UIs stay in sync
    socket.broadcast.emit('x32:fader', { channel, bus, level });
  });

  socket.on('x32:getFader', ({ channel, bus }) => {
    x32.getFader(channel, bus);
  });

  socket.on('x32:requestState', ({ faders, bus }) => {
    x32.requestFaderState(faders, bus);
  });

  socket.on('x32:setIp', ({ ip }) => {
    x32.setX32Ip(ip);
  });

  socket.on('x32:setBusMaster', ({ bus, level }) => {
    x32.setBusMasterFader(bus, level);
    socket.broadcast.emit('x32:busMaster', { bus, level });
  });

  socket.on('x32:getBusMaster', ({ bus }) => {
    x32.getBusMasterFader(bus);
  });

  socket.on('x32:setLR', ({ level }) => {
    x32.setLRFader(level);
    socket.broadcast.emit('x32:lr', { level });
  });

  socket.on('x32:getLR', () => {
    x32.getLRFader();
  });

  // Send all cached channel names to a newly connected client
  socket.on('x32:getChannelNames', () => {
    const names = x32.getAllChannelNames();
    Object.entries(names).forEach(([ch, name]) => {
      socket.emit('x32:channelName', { channel: parseInt(ch), name });
    });
  });

  // Send all cached bus names
  socket.on('x32:getBusNames', () => {
    const busNames = x32.getAllBusNames();
    Object.entries(busNames).forEach(([b, name]) => {
      socket.emit('x32:busName', { bus: parseInt(b), name });
    });
  });

  // ── X32 Advanced Mix ──
  socket.on('x32:setMute', ({ channel, muted }) => {
    x32.setMute(channel, muted);
    socket.broadcast.emit('x32:mute', { channel, on: muted ? 0 : 1 });
  });

  socket.on('x32:getMute', ({ channel }) => {
    x32.getMute(channel);
  });

  socket.on('x32:setEqParam', ({ channel, band, param, value }) => {
    x32.setEqParam(channel, band, param, value);
  });

  socket.on('x32:setDynParam', ({ channel, param, value }) => {
    x32.setDynParam(channel, param, value);
  });

  socket.on('x32:requestChannelDetail', ({ channel }) => {
    x32.requestChannelDetail(channel);
  });

  // ── Auth ──
  socket.on('user:checkName', ({ name }) => {
    const users = loadUsers();
    const exists = Object.prototype.hasOwnProperty.call(users, name) && !!users[name].pin;
    socket.emit('user:nameStatus', { name, exists });
  });

  socket.on('user:auth', ({ name, pin, isAdmin }) => {
    const trimmed = (name || '').trim();
    if (!trimmed || !pin) return socket.emit('user:authResult', { success: false, error: 'Missing name or PIN' });

    // Admin path
    if (isAdmin) {
      if (pin !== ADMIN_PASSWORD) {
        return socket.emit('user:authResult', { success: false, error: 'Incorrect admin code' });
      }
      const token = createSession(trimmed, 'admin');
      console.log(`[Auth] Band Leader signed in: ${trimmed}`);
      return socket.emit('user:authResult', { success: true, name: trimmed, role: 'admin', token });
    }

    // Member path
    const users = loadUsers();
    if (users[trimmed] && users[trimmed].pin) {
      // Existing user — validate PIN
      if (users[trimmed].pin !== hashPin(pin)) {
        return socket.emit('user:authResult', { success: false, error: 'Incorrect PIN' });
      }
    } else {
      // New user — create account with this PIN
      users[trimmed] = { pin: hashPin(pin), bus: 1, faders: [] };
      saveUsers(users);
      console.log(`[Auth] New user created: ${trimmed}`);
    }
    const token = createSession(trimmed, 'member');
    console.log(`[Auth] Signed in: ${trimmed}`);
    socket.emit('user:authResult', { success: true, name: trimmed, role: 'member', token });
  });

  socket.on('user:validateSession', ({ token }) => {
    const session = validateSession(token);
    if (session) {
      socket.emit('user:sessionValid', session);
    } else {
      socket.emit('user:sessionInvalid');
    }
  });

  // Return just the list of names (no sensitive data) for the login quick-picker
  socket.on('user:listNames', () => {
    const users = loadUsers();
    const names = Object.keys(users).filter(n => users[n].pin);
    socket.emit('user:nameList', names);
  });

  // Change own PIN — requires current PIN to verify identity
  socket.on('user:changePin', ({ name, currentPin, newPin }) => {
    const users = loadUsers();
    if (!users[name] || !users[name].pin) {
      return socket.emit('user:changePinResult', { success: false, error: 'User not found' });
    }
    if (users[name].pin !== hashPin(currentPin)) {
      return socket.emit('user:changePinResult', { success: false, error: 'Current PIN is incorrect' });
    }
    if (!newPin || String(newPin).length < 4) {
      return socket.emit('user:changePinResult', { success: false, error: 'New PIN must be at least 4 digits' });
    }
    users[name].pin = hashPin(newPin);
    saveUsers(users);
    console.log(`[Auth] PIN changed for: ${name}`);
    socket.emit('user:changePinResult', { success: true });
  });

  // ── Admin: user management ──
  socket.on('admin:listUsers', () => {
    const users = loadUsers();
    const list = Object.entries(users).map(([name, data]) => ({
      name,
      hasPin: !!data.pin,
      bus: data.bus,
      faderCount: (data.faders || []).length,
    }));
    socket.emit('admin:userList', list);
  });

  socket.on('admin:resetPin', ({ name }) => {
    const users = loadUsers();
    if (users[name]) {
      delete users[name].pin;
      saveUsers(users);
      console.log(`[Auth] PIN reset for: ${name}`);
      socket.emit('admin:pinReset', { name });
    }
  });

  socket.on('admin:deleteUser', ({ name }) => {
    const users = loadUsers();
    if (users[name]) {
      delete users[name];
      saveUsers(users);
      console.log(`[Auth] User deleted: ${name}`);
      socket.emit('admin:userDeleted', { name });
    }
  });

  // ── User config ──
  socket.on('user:load', ({ name }) => {
    const users = loadUsers();
    const { pin: _pin, ...config } = users[name] || { bus: 1, faders: [] };
    socket.emit('user:config', { name, config });
    if (config.faders && config.faders.length > 0) {
      x32.requestFaderState(config.faders, config.bus);
      // Push channel names for this user's faders immediately so labels resolve on first render
      const allNames = x32.getAllChannelNames();
      config.faders.forEach(({ channel }) => {
        if (allNames[channel] !== undefined) {
          socket.emit('x32:channelName', { channel, name: allNames[channel] });
        }
      });
    }
  });

  socket.on('user:save', ({ name, config }) => {
    const users = loadUsers();
    // Preserve existing pin — never overwrite it from the client
    const existingPin = users[name]?.pin;
    users[name] = { ...config, ...(existingPin ? { pin: existingPin } : {}) };
    saveUsers(users);
    socket.emit('user:saved', { name });
  });

  // ── Timeline ──
  socket.on('timeline:start', () => timeline.start());
  socket.on('timeline:stop', () => timeline.stop());
  socket.on('timeline:reset', () => timeline.reset());
  socket.on('timeline:toggle', () => timeline.toggle());
  socket.on('timeline:setBpm', ({ bpm }) => timeline.setBpm(bpm));
  socket.on('timeline:jumpToBar', ({ bar }) => timeline.jumpToBar(bar));
  socket.on('timeline:fireCue', ({ cueId }) => timeline.fireCue(cueId));

  socket.on('timeline:loadShow', ({ name }) => {
    const show = loadShow(name);
    if (show) {
      timeline.loadShow(show);
      io.emit('timeline:state', timeline.getState());
      io.emit('timeline:showLoaded', { name });
    }
  });

  socket.on('timeline:saveShow', ({ name, show }) => {
    saveShow(name, show);
    timeline.loadShow(show);
    socket.emit('timeline:showSaved', { name });
  });

  // ── MIDI ──
  socket.on('midi:send', (msg) => {
    midi.send(msg);
  });

  socket.on('midi:openPort', ({ index }) => {
    const success = midi.openPort(index);
    socket.emit('midi:status', midi.getStatus());
  });

  // ── OBS ──
  socket.on('obs:connect', async ({ host, port, password }) => {
    await obs.connect(host, port, password);
    socket.emit('obs:status', obs.getStatus());
  });

  socket.on('obs:setScene', async ({ scene }) => {
    await obs.setScene(scene);
  });

  socket.on('obs:toggleStream', async () => {
    await obs.toggleStream();
  });

  socket.on('obs:toggleRecording', async () => {
    await obs.toggleRecording();
  });

  socket.on('obs:startStream', async () => await obs.startStream());
  socket.on('obs:stopStream', async () => await obs.stopStream());
  socket.on('obs:startRecording', async () => await obs.startRecording());
  socket.on('obs:stopRecording', async () => await obs.stopRecording());

  // ── Setlist ──
  socket.on('setlist:load', () => {
    socket.emit('setlist:data', loadSetlist());
  });

  socket.on('setlist:add', ({ song }) => {
    const songs = loadSetlist();
    const newSong = {
      id: crypto.randomBytes(8).toString('hex'),
      title: (song.title || '').trim() || 'Untitled',
      artist: (song.artist || '').trim(),
      key: (song.key || '').trim(),
      tempo: (song.tempo || '').trim(),
      notes: (song.notes || '').trim(),
      lyrics: (song.lyrics || '').trim(),
      bassTab: (song.bassTab || '').trim(),
      guitarTab: (song.guitarTab || '').trim(),
      order: songs.length,
      vocalClaimers: {},
    };
    songs.push(newSong);
    saveSetlist(songs);
    io.emit('setlist:data', songs);
  });

  socket.on('setlist:update', ({ id, changes }) => {
    const songs = loadSetlist();
    const idx = songs.findIndex(s => s.id === id);
    if (idx === -1) return;
    const allowed = ['title', 'artist', 'key', 'tempo', 'notes', 'lyrics', 'bassTab', 'guitarTab'];
    allowed.forEach(k => { if (k in changes) songs[idx][k] = changes[k]; });
    saveSetlist(songs);
    io.emit('setlist:data', songs);
  });

  socket.on('setlist:delete', ({ id }) => {
    let songs = loadSetlist().filter(s => s.id !== id);
    songs.forEach((s, i) => { s.order = i; });
    saveSetlist(songs);
    io.emit('setlist:data', songs);
  });

  socket.on('setlist:reorder', ({ songs: reordered }) => {
    const songs = loadSetlist();
    reordered.forEach(({ id, order }) => {
      const s = songs.find(s => s.id === id);
      if (s) s.order = order;
    });
    songs.sort((a, b) => a.order - b.order);
    saveSetlist(songs);
    io.emit('setlist:data', songs);
  });

  socket.on('setlist:claimVocal', ({ songId, userName, claimed }) => {
    const songs = loadSetlist();
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    if (claimed) {
      song.vocalClaimers[userName] = userName;
    } else {
      delete song.vocalClaimers[userName];
    }
    saveSetlist(songs);
    io.emit('setlist:data', songs);
  });

  // ── Lyrics ──
  socket.on('lyrics:load', ({ name }) => {
    const data = loadLyrics(name);
    socket.emit('lyrics:data', { name, data });
  });

  socket.on('lyrics:broadcast', (payload) => {
    // Admin pushes current section to all clients
    io.emit('lyrics:current', payload);
  });

  // ── Server Settings ──
  socket.on('settings:get', () => {
    const cfg = loadServerConfig();
    socket.emit('settings:data', {
      x32Ip: cfg.x32Ip,
      obsHost: cfg.obsHost,
      obsPort: cfg.obsPort,
      obsPassword: '', // never send password back to client
      midiPortIndex: cfg.midiPortIndex,
      midiPorts: midi.getAvailablePorts(),
      x32Status: x32.getStatus(),
      obsStatus: obs.getStatus(),
    });
  });

  socket.on('settings:save', async ({ section, ...changes }) => {
    const cfg = loadServerConfig();
    try {
      if (section === 'x32') {
        cfg.x32Ip = changes.x32Ip;
        x32.setX32Ip(changes.x32Ip);
        console.log(`[Settings] X32 IP set to ${changes.x32Ip}`);
      } else if (section === 'obs') {
        cfg.obsHost = changes.obsHost;
        cfg.obsPort = changes.obsPort;
        if (changes.obsPassword) cfg.obsPassword = changes.obsPassword;
        await obs.connect(changes.obsHost, changes.obsPort, changes.obsPassword || cfg.obsPassword);
        console.log(`[Settings] OBS connecting to ${changes.obsHost}:${changes.obsPort}`);
      } else if (section === 'midi') {
        cfg.midiPortIndex = changes.midiPortIndex;
        midi.openPort(changes.midiPortIndex);
        io.emit('midi:status', midi.getStatus());
        console.log(`[Settings] MIDI port set to index ${changes.midiPortIndex}`);
      }
      saveServerConfig(cfg);
      socket.emit('settings:saved', { section });
    } catch (e) {
      socket.emit('settings:error', { section, error: e.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ─── Static / SPA fallback (must come AFTER all API routes) ──────────────────

if (fs.existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
  app.get('*', (req, res) => res.sendFile(path.join(CLIENT_BUILD, 'index.html')));
} else {
  app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>BHP Server</title></head>
      <body style="background:#111;color:#0f0;font-family:monospace;padding:2rem">
        <h1>BHP Server Running</h1>
        <p>Run <code>npm run build</code> in the client/ directory to build the UI.</p>
        <p>Or run <code>npm run dev</code> in client/ for hot-reload dev mode (port 5173).</p>
      </body></html>`);
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       BHP — Backhouse Productions        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Server:  http://localhost:${PORT}`);

  // Get local IP for iPad access
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  iPad:    http://${net.address}:${PORT}`);
      }
    }
  }
  console.log('');
  console.log(`  MIDI:    ${midi.portName || 'No MIDI output'}`);
  console.log('  OBS:     Waiting (connect via UI)');
  console.log('  X32:     Searching...');
  console.log('');

  const srvCfg = loadServerConfig();

  // Start X32
  x32.start(srvCfg.x32Ip);

  // Auto-connect OBS if a non-localhost host is configured, or if env override
  if (process.env.OBS_HOST || srvCfg.obsHost !== 'localhost') {
    await obs.connect(
      process.env.OBS_HOST || srvCfg.obsHost,
      parseInt(process.env.OBS_PORT) || srvCfg.obsPort,
      process.env.OBS_PASSWORD || srvCfg.obsPassword
    );
  }

  // Apply saved MIDI port
  if (srvCfg.midiPortIndex > 0) {
    midi.openPort(srvCfg.midiPortIndex);
  }

  // Open browser on Mac/Windows
  try {
    await open(`http://localhost:${PORT}`);
  } catch (e) {
    // Non-fatal — browser open may not work in all environments
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[BHP] Shutting down...');
  midi.close();
  obs.disconnect();
  process.exit(0);
});
