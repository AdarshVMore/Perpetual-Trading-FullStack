import { createRedisConnection } from "@redis-client";
import { SubcriptionManager } from "./SubscriptionManager";

export class initializePubSub {
  constructor(private subscriptionmanager: SubcriptionManager) {}

  async init() {
    console.log("trying to connect websocket redis subscriber");
    const subscriber = await createRedisConnection();
    subscriber?.on("error", (err) => {
      console.log(err);
    });

    const channelName = "depth:BTCUSDT";

    console.log(`subscribing to ${channelName}`);
    await subscriber?.subscribe(channelName, (message: string) => {
      const parsedData = JSON.parse(message);
      const sockets = this.subscriptionmanager.getSubscribers(channelName);
      if (!sockets) {
        console.log("received pubsub message, but no sockets are subscribed");
        return;
      }
      for (let socket of sockets) {
        socket.send(JSON.stringify(parsedData));
      }
      console.log("subscribed to channel and recieved this data", parsedData);
    });
  }
}
