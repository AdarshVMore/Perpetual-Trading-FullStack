import {
  BINANCE_CONTROL_CHANNEL,
  BINANCE_WANTED_KEY,
  BINANCE_WANTED_TTL_SECONDS,
  createRedisConnection,
  snapshotKey,
} from "@redis-client";
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

  async setBinanceWanted(wanted: boolean) {
    if (!this.snapshotReader) return;
    try {
      if (wanted) {
        await this.snapshotReader.set(BINANCE_WANTED_KEY, "1", {
          EX: BINANCE_WANTED_TTL_SECONDS,
        });
        await this.snapshotReader.publish(BINANCE_CONTROL_CHANNEL, "start");
        console.log("signaled binance start");
      } else {
        await this.snapshotReader.del(BINANCE_WANTED_KEY);
        await this.snapshotReader.publish(BINANCE_CONTROL_CHANNEL, "stop");
        console.log("signaled binance stop");
      }
    } catch (error) {
      console.error("failed to signal binance demand", error);
    }
  }

  async refreshBinanceWanted() {
    if (!this.snapshotReader) return;
    try {
      await this.snapshotReader.set(BINANCE_WANTED_KEY, "1", {
        EX: BINANCE_WANTED_TTL_SECONDS,
      });
    } catch (error) {
      console.error("failed to refresh binance wanted key", error);
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
