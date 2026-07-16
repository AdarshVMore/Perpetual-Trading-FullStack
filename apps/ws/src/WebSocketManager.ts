import type { WsRequests } from "@shared-types/src";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { SubcriptionManager } from "./SubscriptionManager";
import type { initializePubSub } from "./RedisSubscriber";

/** Wait after last client leaves before stopping Binance (avoids flap on tab refresh). */
const BINANCE_IDLE_STOP_MS = Number(process.env.BINANCE_IDLE_STOP_MS ?? 30_000);
const BINANCE_HEARTBEAT_MS = Number(process.env.BINANCE_HEARTBEAT_MS ?? 30_000);

export class WebsocketManager {
  private connectionCount = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private ws: WebSocketServer,
    private subscriptionManager: SubcriptionManager,
    private initializePubSub: initializePubSub,
  ) {
    this.handleConnect();
  }

  handleConnect() {
    this.ws.on("connection", (socket: WebSocket) => {
      this.onClientJoined();

      socket.on("message", (data: RawData) => {
        void this.handleMessage(socket, data.toString());
      });

      socket.on("close", async () => {
        await this.handleDisconnect(socket);
        this.onClientLeft();
      });
    });
  }

  private onClientJoined() {
    this.connectionCount += 1;

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    if (this.connectionCount === 1) {
      void this.initializePubSub.setBinanceWanted(true);
      this.startHeartbeat();
    }
  }

  private onClientLeft() {
    this.connectionCount = Math.max(0, this.connectionCount - 1);

    if (this.connectionCount > 0) return;

    this.stopHeartbeat();
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      if (this.connectionCount === 0) {
        void this.initializePubSub.setBinanceWanted(false);
      }
    }, BINANCE_IDLE_STOP_MS);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.connectionCount > 0) {
        void this.initializePubSub.refreshBinanceWanted();
      }
    }, BINANCE_HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async handleDisconnect(socket: WebSocket) {
    const emptyChannels = this.subscriptionManager.removeSocket(socket);

    for (const channel of emptyChannels) {
      await this.initializePubSub.unsubscribeIfUnused(channel);
    }
  }

  async handleMessage(socket: WebSocket, data: string) {
    try {
      const message: WsRequests = JSON.parse(data);
      if (message.type === "SUBSCRIBE") {
        const channel = this.subscriptionManager.createChannel(
          message.channel,
          message.market,
          message.userId,
        );

        this.subscriptionManager.subscribe(channel, socket);
        await this.initializePubSub.sendMessageBack(channel);
        socket.send(JSON.stringify({ type: "SUBSCRIBED", channel }));

        const snapshot = await this.initializePubSub.getSnapshot(channel);
        if (snapshot && socket.readyState === WebSocket.OPEN) {
          socket.send(snapshot);
        }
      } else if (message.type === "UNSUBSCRIBE") {
        const channel = this.subscriptionManager.createChannel(
          message.channel,
          message.market,
          message.userId,
        );
        const channelIsEmpty = this.subscriptionManager.unsubscribeChannel(
          channel,
          socket,
        );

        if (channelIsEmpty) {
          await this.initializePubSub.unsubscribeIfUnused(channel);
        }

        socket.send(JSON.stringify({ type: "UNSUBSCRIBED", channel }));
      }
    } catch (err) {
      console.error(err);
      socket.send(
        JSON.stringify({ type: "ERROR", message: "Invalid request" }),
      );
    }
  }
}
