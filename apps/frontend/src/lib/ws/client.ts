import { WS_URL } from "../constants";

export type WsChannel = "depth" | "trade" | "ticker" | "position" | "order";

export interface WsSubscribeMessage {
  type: "SUBSCRIBE" | "UNSUBSCRIBE";
  channel: WsChannel;
  market: string;
  userId?: string;
}

export interface FeedSocketCallbacks {
  onStatusChange: (connected: boolean) => void;
  onMessage: (data: Record<string, unknown>) => void;
}

const RECONNECT_DELAY_MS = 3_000;

function subKey(channel: WsChannel, market: string, userId?: string): string {
  return userId ? `${channel}:${userId}:${market}` : `${channel}:${market}`;
}

/**
 * WebSocket client for apps/ws (port 8080).
 * Uses SUBSCRIBE / UNSUBSCRIBE channel protocol — no JWT on connect.
 */
export class FeedSocket {
  private ws: WebSocket | null = null;
  private callbacks: FeedSocketCallbacks;
  private subscriptions = new Map<string, WsSubscribeMessage>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;

  constructor(callbacks: FeedSocketCallbacks) {
    this.callbacks = callbacks;
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  disconnect() {
    this.closedByUser = true;
    this.clearReconnect();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.onStatusChange(false);
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  subscribe(channel: WsChannel, market: string, userId?: string) {
    const msg: WsSubscribeMessage = {
      type: "SUBSCRIBE",
      channel,
      market,
      ...(userId ? { userId } : {}),
    };
    this.subscriptions.set(subKey(channel, market, userId), msg);
    this.send(msg);
  }

  unsubscribe(channel: WsChannel, market: string, userId?: string) {
    const key = subKey(channel, market, userId);
    this.subscriptions.delete(key);
    this.send({
      type: "UNSUBSCRIBE",
      channel,
      market,
      ...(userId ? { userId } : {}),
    });
  }

  clearSubscriptions() {
    for (const msg of this.subscriptions.values()) {
      this.send({ ...msg, type: "UNSUBSCRIBE" });
    }
    this.subscriptions.clear();
  }

  private open() {
    this.clearReconnect();
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      this.callbacks.onStatusChange(true);
      for (const msg of this.subscriptions.values()) {
        this.send(msg);
      }
    };

    ws.onclose = () => {
      this.callbacks.onStatusChange(false);
      if (this.closedByUser) return;
      this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        if (
          data.type === "SUBSCRIBED" ||
          data.type === "UNSUBSCRIBED" ||
          data.type === "ERROR"
        ) {
          return;
        }
        this.callbacks.onMessage(data);
      } catch {
        // ignore malformed frames
      }
    };
  }

  private send(msg: WsSubscribeMessage) {
    if (!this.isOpen()) return;
    this.ws!.send(JSON.stringify(msg));
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
