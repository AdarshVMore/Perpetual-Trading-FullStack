import type { WsRequests } from "@shared-types/src";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { SubcriptionManager } from "./SubscriptionManager";
import type { initializePubSub } from "./RedisSubscriber";

export class WebsocketManager {
  constructor(
    private ws: WebSocketServer,
    private subscriptionManager: SubcriptionManager,
    private initializePubSub: initializePubSub,
  ) {
    this.handleConnect();
  }

  handleConnect() {
    this.ws.on("connection", (socket: WebSocket) => {
      socket.on("message", (data: RawData) => {
        void this.handleMessage(socket, data.toString());
      });

      socket.on("close", async () => {
        await this.handleDisconnect(socket);
      });
    });
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

  //   startFakeDepthFeed() {
  //     setInterval(() => {
  //       const channel = "depth:BTCUSDT";

  //       const subscribers = this.subscriptionManager.getSubscribers(channel);

  //       if (!subscribers) {
  //         throw new Error("no subscribers found");
  //       }

  //       for (const socket of subscribers) {
  //         socket.send(
  //           JSON.stringify({
  //             channel,
  //             bids: [[50000, 2]],
  //             asks: [[50100, 1]],
  //           }),
  //         );
  //       }
  //     }, 2000);
  //   }
}
