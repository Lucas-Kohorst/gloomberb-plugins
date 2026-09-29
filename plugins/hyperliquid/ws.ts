import { reportConnectionRequest } from "gloomberb/plugins";
import type { Book, Trade, StreamStatus } from "./types";
export interface Handlers {
  dexes?: string[];
  mids?: (mids: Record<string, string>) => void;
  book?: (book: Book) => void;
  trades?: (trades: Trade[]) => void;
  status?: (status: StreamStatus) => void;
}
export function subscribe(
  coin: string | null,
  handlers: Handlers,
  createSocket = () => new WebSocket("wss://api.hyperliquid.xyz/ws"),
): () => void {
  let stopped = false,
    attempt = 0,
    socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastMessage = 0,
    lastReport = 0;
  function connect() {
    if (stopped) return;
    handlers.status?.(attempt ? "reconnecting" : "connecting");
    let ws: WebSocket;
    try {
      ws = createSocket();
    } catch {
      reconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      if (stopped) {
        ws.close();
        return;
      }
      lastMessage = Date.now();
      if (handlers.mids) {
        for (const dex of new Set(handlers.dexes ?? [""])) {
          ws.send(
            JSON.stringify({
              method: "subscribe",
              subscription: { type: "allMids", ...(dex ? { dex } : {}) },
            }),
          );
        }
      }
      if (coin)
        for (const type of ["l2Book", "trades"])
          ws.send(
            JSON.stringify({
              method: "subscribe",
              subscription: { type, coin },
            }),
          );
      heartbeat = setInterval(() => {
        if (Date.now() - lastMessage > 60_000) {
          ws.close();
          return;
        }
        if (ws.readyState === 1) ws.send(JSON.stringify({ method: "ping" }));
      }, 20_000);
    };
    ws.onmessage = (event) => {
      if (stopped || socket !== ws) return;
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      lastMessage = Date.now();
      const { channel, data } = message;
      if (channel === "allMids" && data?.mids) handlers.mids?.(data.mids);
      else if (
        channel === "l2Book" &&
        data?.coin === coin &&
        Array.isArray(data.levels) &&
        data.levels.length === 2
      )
        handlers.book?.(data);
      else if (channel === "trades" && Array.isArray(data))
        handlers.trades?.(data.filter((t: Trade) => t.coin === coin));
      else return;
      attempt = 0;
      handlers.status?.("live");
      if (Date.now() - lastReport > 10_000) {
        lastReport = Date.now();
        reportConnectionRequest("hyperliquid-ws", {
          success: true,
          durationMs: 0,
          operation: channel,
        });
      }
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      clearInterval(heartbeat);
      if (stopped) return;
      reportConnectionRequest("hyperliquid-ws", {
        success: false,
        durationMs: 0,
        operation: "stream",
        error: "Disconnected; reconnecting",
      });
      reconnect();
    };
  }
  function reconnect() {
    handlers.status?.("reconnecting");
    retry = setTimeout(
      connect,
      Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)),
    );
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(heartbeat);
    socket?.close();
  };
}
