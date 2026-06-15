import { createRedisConnection } from "@redis-client";
import { SubcriptionManager } from "./SubscriptionManager";
import type { RedisClientType } from "redis";
import { WebSocket } from "ws";

export class initializePubSub {
  private subscriber: RedisClientType | null = null;
  private activeChannels = new Set<string>();

  constructor(private subscriptionmanager: SubcriptionManager) {}

  async init() {
    console.log("trying to connect websocket redis subscriber");
    this.subscriber = await createRedisConnection();
    this.subscriber?.on("error", (err: Error) => {
      console.log(err);
    });
  }

  async sendMessageBack(channelName: string) {
    if (!this.subscriber) {
      throw new Error("Redis subscriber is not connected");
    }

    if (this.activeChannels.has(channelName)) {
      return;
    }

    console.log(`subscribing to ${channelName}`);
    this.activeChannels.add(channelName);

    await this.subscriber.subscribe(channelName, (message: string) => {
      const sockets = this.subscriptionmanager.getSubscribers(channelName);
      if (!sockets || sockets.size === 0) {
        console.log("received pubsub message, but no sockets are subscribed");
        return;
      }

      let parsedData: unknown;
      try {
        parsedData = JSON.parse(message);
      } catch (error) {
        console.error("failed to parse redis pubsub message", error);
        return;
      }

      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(parsedData));
        }
      }
      console.log("received pubsub data", channelName, parsedData);
    });
  }

  async unsubscribeIfUnused(channelName: string) {
    if (
      !this.subscriber ||
      !this.activeChannels.has(channelName) ||
      this.subscriptionmanager.hasSubscribers(channelName)
    ) {
      return;
    }

    await this.subscriber.unsubscribe(channelName);
    this.activeChannels.delete(channelName);
    console.log(`unsubscribed redis from ${channelName}`);
  }
}
