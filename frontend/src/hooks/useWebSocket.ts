import { useCallback, useEffect, useRef, useState } from "react";

export type SocketStatus = "disconnected" | "connecting" | "connected";

export function useWebSocket<T>(
  url: string | null,
  onMessage: (message: T) => void,
  enabled = true,
) {
  const [status, setStatus] = useState<SocketStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !url) {
      setStatus("disconnected");
      return;
    }

    let disposed = false;
    let reconnectTimer: number | undefined;
    let retryDelay = 1000;

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          socket.close();
          return;
        }
        retryDelay = 1000;
        setError(null);
        setStatus("connected");
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          onMessageRef.current(JSON.parse(event.data) as T);
        } catch {
          setError("Сервер прислал некорректное сообщение WebSocket.");
        }
      };

      socket.onerror = () => {
        setError("Ошибка WebSocket-соединения.");
      };

      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        setStatus("disconnected");
        if (event.code === 1008) {
          setError(`Сервер отклонил WebSocket-соединение: ${event.reason || "проверьте права доступа"}.`);
          return;
        }
        reconnectTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    };
  }, [enabled, url]);

  const sendMessage = useCallback((message: unknown): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  return { status, error, sendMessage };
}
