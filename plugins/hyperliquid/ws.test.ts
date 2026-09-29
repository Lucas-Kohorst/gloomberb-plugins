import { expect, test } from "bun:test";
import { subscribe } from "./ws";
class FakeSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(message: string) {
    this.sent.push(message);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  message(channel: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ channel, data }) });
  }
}
test("socket reconnects with subscriptions and stops callbacks/retries on disposal", async () => {
  const sockets: FakeSocket[] = [];
  const received: unknown[] = [];
  const stop = subscribe("HYPE", { book: (b) => received.push(b) }, () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as unknown as WebSocket;
  });
  try {
    const first = sockets[0]!;
    first.onopen?.();
    expect(first.sent.map((s) => JSON.parse(s).subscription)).toEqual([
      { type: "l2Book", coin: "HYPE" },
      { type: "trades", coin: "HYPE" },
    ]);
    first.message("l2Book", { coin: "BTC", levels: [[], []] });
    expect(received).toHaveLength(0);
    first.message("l2Book", { coin: "HYPE", levels: [[], []] });
    expect(received).toHaveLength(1);
    first.close();
    await Bun.sleep(1100);
    expect(sockets).toHaveLength(2);
    sockets[1]!.onopen?.();
    expect(sockets[1]!.sent).toHaveLength(2);
    stop();
    sockets[1]!.message("l2Book", { coin: "HYPE", levels: [[], []] });
    expect(received).toHaveLength(1);
    expect(sockets[1]!.closed).toBe(true);
    await Bun.sleep(1100);
    expect(sockets).toHaveLength(2);
  } finally {
    stop();
  }
});
