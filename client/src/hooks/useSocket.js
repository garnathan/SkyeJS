import { useEffect, useState, useCallback } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const socket = connectSocket();

    const onConnect = () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
    };

    const onDisconnect = () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    };

    const onPriceUpdate = (data) => {
      console.log('[Socket] Price update:', data);
      setLastUpdate(data);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('price-update', onPriceUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('price-update', onPriceUpdate);
      disconnectSocket();
    };
  }, []);

  const subscribe = useCallback((event, callback) => {
    const socket = getSocket();
    socket.on(event, callback);
    return () => socket.off(event, callback);
  }, []);

  return { isConnected, lastUpdate, subscribe };
}

export default useSocket;
