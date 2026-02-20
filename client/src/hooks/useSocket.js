import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

// Singleton socket — created immediately, shared across the app
let _socket = null;

function getSocket() {
  if (!_socket) {
    const url = import.meta.env.DEV
      ? 'http://localhost:3000'
      : window.location.origin;
    _socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity
    });
  }
  return _socket;
}

// Initialize the socket immediately (not inside a useEffect)
// so emit/on are always safe to call
const _sharedSocket = getSocket();

export function useSocket() {
  const [connected, setConnected] = useState(_sharedSocket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    // Sync state in case it changed before this effect ran
    setConnected(_sharedSocket.connected);

    _sharedSocket.on('connect', onConnect);
    _sharedSocket.on('disconnect', onDisconnect);

    return () => {
      _sharedSocket.off('connect', onConnect);
      _sharedSocket.off('disconnect', onDisconnect);
    };
  }, []);

  const emit = useCallback((event, data) => {
    _sharedSocket.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    _sharedSocket.on(event, handler);
    return () => _sharedSocket.off(event, handler);
  }, []);

  return { connected, emit, on };
}
