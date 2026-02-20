import { useRef, useCallback, useState } from 'react';

export function useAudio() {
  const ctxRef = useRef(null);
  const elementsRef = useRef({}); // url → HTMLAudioElement
  const [playingFiles, setPlayingFiles] = useState(new Set());

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  // Synthesize a metronome click — accent (beat 1) is higher pitched and louder
  const playClick = useCallback((isAccent, volume = 0.7) => {
    try {
      const ctx = getCtx();
      const freq = isAccent ? 1200 : 800;
      const amp  = isAccent ? volume : volume * 0.55;
      const dur  = 0.04; // 40ms burst

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(amp, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur + 0.01);
    } catch {
      // AudioContext unavailable
    }
  }, [getCtx]);

  // Play an audio file by URL
  const playFile = useCallback((url, volume = 1, loop = false) => {
    let el = elementsRef.current[url];
    if (!el) {
      el = new Audio(url);
      elementsRef.current[url] = el;
      el.addEventListener('ended', () => {
        if (!el.loop) {
          setPlayingFiles(prev => { const s = new Set(prev); s.delete(url); return s; });
        }
      });
    }
    el.volume = Math.max(0, Math.min(1, volume));
    el.loop = loop;
    el.currentTime = 0;
    el.play().then(() => {
      setPlayingFiles(prev => new Set([...prev, url]));
    }).catch(() => {});
  }, []);

  // Stop a specific file (or all files if no url given)
  const stopFile = useCallback((url) => {
    if (url) {
      const el = elementsRef.current[url];
      if (el) {
        el.pause();
        el.currentTime = 0;
        setPlayingFiles(prev => { const s = new Set(prev); s.delete(url); return s; });
      }
    } else {
      Object.values(elementsRef.current).forEach(el => { el.pause(); el.currentTime = 0; });
      setPlayingFiles(new Set());
    }
  }, []);

  return { playClick, playFile, stopFile, getCtx, playingFiles };
}
