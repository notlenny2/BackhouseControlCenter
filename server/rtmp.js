const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class RTMPServer {
  constructor(mediaDir) {
    this.mediaDir = mediaDir;
    this.ffmpeg = null;
    this.stopped = false;
    this.available = null;
    this.ffmpegExe = null;
  }

  _findFfmpegCandidates() {
    const candidates = [];
    const push = (p) => {
      if (!p) return;
      if (!candidates.includes(p)) candidates.push(p);
    };

    push(process.env.FFMPEG_PATH);
    push('ffmpeg');
    push('C:\\ffmpeg\\bin\\ffmpeg.exe');
    push('C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe');
    push('C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe');
    push('C:\\Users\\Golf\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe');

    // Common Winget install roots
    const roots = [
      'C:\\Program Files\\ffmpeg',
      'C:\\ProgramData\\chocolatey\\bin',
      'C:\\Users\\Public\\ffmpeg',
    ];
    roots.forEach((r) => push(`${r}\\bin\\ffmpeg.exe`));
    if (process.env.USERPROFILE) {
      push(`${process.env.USERPROFILE}\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe`);
    }

    // Try user-scoped Winget package directories.
    for (let i = 1; i <= 3; i++) {
      const user = process.env.USERNAME || '';
      const base = user ? `C:\\Users\\${user}\\AppData\\Local\\Microsoft\\WinGet\\Packages` : null;
      if (!base || !fs.existsSync(base)) break;
      try {
        const dirs = fs.readdirSync(base).filter((d) => d.startsWith('Gyan.FFmpeg'));
        dirs.forEach((d) => {
          const p1 = `${base}\\${d}\\ffmpeg\\bin\\ffmpeg.exe`;
          const p2 = `${base}\\${d}\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe`;
          push(p1);
          push(p2);
          try {
            const sub = fs.readdirSync(`${base}\\${d}`);
            sub.forEach((s) => push(`${base}\\${d}\\${s}\\bin\\ffmpeg.exe`));
          } catch {}
        });
      } catch {}
      break;
    }

    return candidates;
  }

  _hasFfmpeg() {
    if (this.available !== null) return this.available;

    for (const candidate of this._findFfmpegCandidates()) {
      try {
        // If it's an absolute path, skip non-existent files quickly.
        if (candidate.includes('\\') && !fs.existsSync(candidate)) continue;
        const r = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
        if (r.status === 0) {
          this.ffmpegExe = candidate;
          this.available = true;
          console.log(`[RTMP] Using FFmpeg: ${candidate}`);
          return true;
        }
      } catch {}
    }

    this.available = false;
    return this.available;
  }

  _hlsDir() {
    return path.join(this.mediaDir, 'live', 'stream');
  }

  _ensureHlsDir() {
    const dir = this._hlsDir();
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.readdirSync(dir).forEach((f) => {
        if (f.endsWith('.ts') || f.endsWith('.m3u8')) {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      });
    } catch {}
  }

  start() {
    if (this.stopped) this.stopped = false;
    if (!this._hasFfmpeg()) {
      console.log('[RTMP] FFmpeg not found. HLS preview disabled.');
      return;
    }
    this._spawnListener();
  }

  _spawnListener() {
    if (this.ffmpeg || this.stopped) return;
    this._ensureHlsDir();
    const out = path.join(this._hlsDir(), 'index.m3u8');
    const args = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-listen', '1',
      '-i', 'rtmp://127.0.0.1:1935/live/stream',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'hls',
      '-hls_time', '1',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list+omit_endlist+program_date_time',
      out,
    ];

    this.ffmpeg = spawn(this.ffmpegExe || 'ffmpeg', args, { stdio: 'ignore' });
    console.log('[RTMP] Listening on rtmp://localhost:1935/live/stream for OBS input');

    this.ffmpeg.on('exit', () => {
      this.ffmpeg = null;
      if (this.stopped) return;
      setTimeout(() => this._spawnListener(), 1000);
    });
  }

  stop() {
    this.stopped = true;
    if (this.ffmpeg) {
      try { this.ffmpeg.kill('SIGTERM'); } catch {}
      this.ffmpeg = null;
    }
  }
}

module.exports = { RTMPServer };
