// obs.js — OBS WebSocket v5 client
const OBSWebSocket = require('obs-websocket-js').default;

class OBSController {
  constructor(io) {
    this.io = io;
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.scenes = [];
    this.currentScene = null;
    this.streaming = false;
    this.recording = false;
    this.screenshotTimer = null;
    this.host = null;
    this.port = null;
    this.password = null;
    this.reconnectTimer = null;
    this.screenshotBusy = false;
    this.previewTimer = null;
    this.previewIndex = 0;
  }

  async _emitScreenshot() {
    if (!this.connected || !this.currentScene) return;
    if (this.screenshotBusy) return;
    this.screenshotBusy = true;
    try {
      const { imageData } = await this.obs.call('GetSourceScreenshot', {
        sourceName: this.currentScene,
        imageFormat: 'jpeg',
        imageWidth: 960,
        imageHeight: 540,
        imageCompressionQuality: 78,
      });
      // Preview frames are real-time UI hints; drop stale frames under load
      // instead of queueing and increasing visible delay on client devices.
      this.io.volatile.emit('obs:screenshot', { data: imageData });
    } catch (e) {
      // Non-critical preview path; ignore transient OBS screenshot failures.
    } finally {
      this.screenshotBusy = false;
    }
  }

  async connect(host = 'localhost', port = 4455, password = '') {
    this.host = host;
    this.port = port;
    this.password = password;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.obs.connect(`ws://${host}:${port}`, password || undefined);
      this.connected = true;
      console.log(`[OBS] Connected to ${host}:${port}`);
      await this._fetchState();
      this._registerEvents();
      this._startScreenshots();
      this.io.emit('obs:status', this.getStatus());
      this.io.emit('obs:scenes', { scenes: this.scenes, current: this.currentScene });
    } catch (e) {
      console.warn(`[OBS] Could not connect to ${host}:${port} — ${e.message}`);
      this.connected = false;
      this.io.emit('obs:status', this.getStatus());
      this._scheduleReconnect();
    }
  }

  async _fetchState() {
    try {
      const { scenes, currentProgramSceneName } = await this.obs.call('GetSceneList');
      this.scenes = scenes.map(s => s.sceneName);
      this.currentScene = currentProgramSceneName;
      if (this.previewIndex >= this.scenes.length) this.previewIndex = 0;

      const streamStatus = await this.obs.call('GetStreamStatus');
      this.streaming = streamStatus.outputActive;

      const recordStatus = await this.obs.call('GetRecordStatus');
      this.recording = recordStatus.outputActive;
    } catch (e) {
      console.warn('[OBS] State fetch error:', e.message);
    }
  }

  async _emitScenePreview(sceneName) {
    if (!this.connected || !sceneName) return;
    if (this.screenshotBusy) return;
    this.screenshotBusy = true;
    try {
      const { imageData } = await this.obs.call('GetSourceScreenshot', {
        sourceName: sceneName,
        imageFormat: 'jpeg',
        imageWidth: 480,
        imageHeight: 270,
        imageCompressionQuality: 68,
      });
      this.io.volatile.emit('obs:scenePreview', { scene: sceneName, data: imageData });
    } catch (e) {
      // Best-effort preview path.
    } finally {
      this.screenshotBusy = false;
    }
  }

  async emitScenePreviews() {
    if (!this.connected || !Array.isArray(this.scenes) || this.scenes.length === 0) return;
    const list = [...this.scenes];
    for (const sceneName of list) {
      await this._emitScenePreview(sceneName);
    }
  }

  async refreshStateAndBroadcast() {
    if (!this.connected) {
      this.io.emit('obs:status', this.getStatus());
      return;
    }
    await this._fetchState();
    this.io.emit('obs:status', this.getStatus());
    this.io.emit('obs:scenes', { scenes: this.scenes, current: this.currentScene });
  }

  _registerEvents() {
    this.obs.removeAllListeners();

    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      this.currentScene = sceneName;
      this.io.emit('obs:sceneChanged', { scene: sceneName });
      this._emitScreenshot();
      this._emitScenePreview(sceneName);
    });

    this.obs.on('StreamStateChanged', ({ outputActive }) => {
      this.streaming = outputActive;
      this.io.emit('obs:streamStatus', { streaming: outputActive });
    });

    this.obs.on('RecordStateChanged', ({ outputActive }) => {
      this.recording = outputActive;
      this.io.emit('obs:recordStatus', { recording: outputActive });
    });

    this.obs.on('SceneListChanged', async () => {
      await this._fetchState();
      this.io.emit('obs:scenes', { scenes: this.scenes, current: this.currentScene });
      this.emitScenePreviews();
    });

    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      console.log('[OBS] Disconnected');
      this._stopScreenshots();
      this.io.emit('obs:status', this.getStatus());
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || !this.host) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.connected && this.host) {
        console.log('[OBS] Attempting reconnect...');
        this.connect(this.host, this.port, this.password);
      }
    }, 5000);
  }

  _startScreenshots() {
    this._stopScreenshots();
    this._emitScreenshot();
    this.screenshotTimer = setInterval(async () => {
      this._emitScreenshot();
    }, 1000);
    this.previewTimer = setInterval(() => {
      if (!this.scenes.length) return;
      const sceneName = this.scenes[this.previewIndex % this.scenes.length];
      this.previewIndex = (this.previewIndex + 1) % this.scenes.length;
      this._emitScenePreview(sceneName);
    }, 800);
    this.emitScenePreviews();
  }

  _stopScreenshots() {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }

  async setScene(sceneName) {
    if (!this.connected) return { error: 'OBS not connected' };
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  async startStream() {
    if (!this.connected) return { error: 'OBS not connected' };
    try {
      await this.obs.call('StartStream');
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  async stopStream() {
    if (!this.connected) return { error: 'OBS not connected' };
    try {
      await this.obs.call('StopStream');
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  async startRecording() {
    if (!this.connected) return { error: 'OBS not connected' };
    try {
      await this.obs.call('StartRecord');
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  async stopRecording() {
    if (!this.connected) return { error: 'OBS not connected' };
    try {
      await this.obs.call('StopRecord');
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  async toggleStream() {
    return this.streaming ? this.stopStream() : this.startStream();
  }

  async toggleRecording() {
    return this.recording ? this.stopRecording() : this.startRecording();
  }

  disconnect() {
    this._stopScreenshots();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try { this.obs.disconnect(); } catch (e) {}
    this.connected = false;
  }

  getStatus() {
    return {
      connected: this.connected,
      scenes: this.scenes,
      currentScene: this.currentScene,
      streaming: this.streaming,
      recording: this.recording
    };
  }
}

module.exports = OBSController;
