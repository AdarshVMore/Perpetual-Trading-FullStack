import { createRedisConnection } from "@redis-client";
import { SubcriptionManager } from "./SubscriptionManager";

export class initializePubSub {
  constructor(private subscriptionmanager: SubcriptionManager) {}

  async init() {
    const subscriber = await createRedisConnection();
    subscriber?.on("error", (err) => {
      console.log(err);
    });
    await subscriber?.connect();

    const channelName = "depth:BTCUSDT";

    await subscriber?.subscribe(channelName, (message: string) => {
      const parsedData = JSON.parse(message);
      const sockets = this.subscriptionmanager.getSubscribers(channelName);
      if (!sockets) {
        throw new Error("no sockets for this channel to send pubSub messages");
      }
      for (let socket of sockets) {
        socket.send(parsedData);
      }
      console.log("subscribed to channel and recieved this data", parsedData);
    });
  }
}
