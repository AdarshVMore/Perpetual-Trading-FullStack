import { createRedisConnection, snapshotKey } from "@redis-client";
import { SubcriptionManager } from "./SubscriptionManager";
import type { RedisClientType } from "redis";
import { WebSocket } from "ws";

export class initializePubSub {
  private subscriber: RedisClientType | null = null;

  private snapshotReader: RedisClientType | null = null;
  private activeChannels = new Set<string>();

  constructor(private subscriptionmanager: SubcriptionManager) {}

  async init() {
    this.subscriber = await createRedisConnection();
    this.subscriber?.on("error", (err: Error) => {
      console.log(err);
    });

    this.snapshotReader = (this.subscriber?.duplicate() ?? null) as
      | RedisClientType
      | null;
    if (this.snapshotReader) {
      this.snapshotReader.on("error", (err: Error) => {
        console.log(err);
      });
      await this.snapshotReader.connect();
    }
  }

  async getSnapshot(channelName: string): Promise<string | null> {
    if (!this.snapshotReader) return null;
    try {
      return await this.snapshotReader.get(snapshotKey(channelName));
    } catch (error) {
      console.error("failed to read snapshot for", channelName, error);
      return null;
    }
  }

  async sendMessageBack(channelName: string) {
    if (!this.subscriber) {
      throw new Error("Redis subscriber is not connected");
    }

    if (this.activeChannels.has(channelName)) {
      return;
    }

    this.activeChannels.add(channelName);

    await this.subscriber.subscribe(channelName, (message: string) => {
      const sockets = this.subscriptionmanager.getSubscribers(channelName);
      if (!sockets || sockets.size === 0) {
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
  }
}
