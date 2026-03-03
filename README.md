# BHP — Backhouse Productions Live Show Control

Browser-based production control app for live band performances.

## Quick Start

```bash
# 1. Start the server
cd server
npm start

# Server opens at http://localhost:3000
# Your local IP is printed for iPad access
```

## Features

- **Monitor Mix** — Personal in-ear mix control via Behringer X32 (OSC)
- **Lyrics** — Full-screen lyric display, admin-pushed to all clients
- **Show Control** — BPM clock, MIDI cue timeline, show file management (admin)
- **Stream Control** — OBS scene switching, stream/recording start/stop (admin)

## Hardware Setup

### Behringer X32
- Connect X32 to same network as server PC/Mac
- X32 is auto-discovered via OSC broadcast (`/xinfo`)
- Or set `X32_IP=192.168.x.x` environment variable to skip discovery

### OBS WebSocket
- Enable in OBS: Tools → WebSocket Server Settings → Enable
- Default port: 4455
- Connect via the Stream tab settings panel in the UI

### MIDI
- Any connected MIDI interface is auto-detected on startup
- Virtual port `BHP MIDI Out` created if no hardware found (route in DAW/MIDI patchbay)

## Development

```bash
# Run server with file watching
cd server && npm run dev

# Run client in dev mode (hot reload)
cd client && npm run dev
# Client proxies /api and socket.io to localhost:3000
```

## macOS Deployment (Apple Silicon)

Packaging scripts and launchd service templates are in:

- `packaging/macos/`

See full instructions:

- `docs/MACOS_DEPLOYMENT.md`

## Config Files

| File | Purpose |
|------|---------|
| `server/config/users.json` | Per-user fader group configs |
| `server/config/shows/*.json` | Show files with BPM + cue lists |
| `server/config/lyrics/*.json` | Song lyrics by section |

## Environment Variables

```bash
X32_IP=192.168.1.100   # Skip X32 discovery
OBS_HOST=192.168.1.50  # Auto-connect OBS on startup
OBS_PORT=4455
OBS_PASSWORD=secret
PORT=3000
```

## Admin Access

Default admin code: `bhp2024`
Change in `client/src/App.jsx` → `ADMIN_PASSWORD` constant.

## Architecture

```
[iPad/Browser] ←→ Socket.io ←→ [Node.js Server]
                                    ├── OSC → X32
                                    ├── MIDI out
                                    └── OBS WebSocket
```
