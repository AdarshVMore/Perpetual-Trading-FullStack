import type { WsRequests } from "@shared-types/src";
import { WebSocketServer, WebSocket } from "ws";
import { SubcriptionManager } from "./SubscriptionManager";
import type { initializePubSub } from "./RedisSubscriber";

export class WebsocketManager {
  constructor(
    private ws: WebSocketServer,
    private subscriptionManager: SubcriptionManager,
  ) {
    this.handleConnect();
  }

  handleConnect() {
    this.ws.on("connection", (socket: WebSocket) => {
      console.log();
      socket.on("message", (data: any) => {
        console.log("recieved message ===>", data.toString());
        this.handleMessage(socket, data.toString());
        console.log("started handle message");
      });

      socket.on("close", () => {
        this.handleDisconnect(socket);
      });
    });
  }

  handleDisconnect(socket: WebSocket) {
    console.log("user disconnected");
    this.subscriptionManager.removeSocket(socket);
  }

  handleMessage(socket: WebSocket, data: string) {
    try {
      const message: WsRequests = JSON.parse(data);

      const type = message.type;
      if (type === "SUBSCRIBE") {
        const channel = this.subscriptionManager.createChannel(
          message.channel,
          message.market,
        );
        console.log("created channel , ", channel);

        this.subscriptionManager.subscribe(channel, socket);
      } else if (type === "UNSUBSCRIBE") {
        const channel = this.subscriptionManager.createChannel(
          message.channel,
          message.market,
        );
        this.subscriptionManager.unsubscribeChannel(channel, socket);
      }
      socket.send("message handled");
    } catch (err) {
      console.error(err);
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
