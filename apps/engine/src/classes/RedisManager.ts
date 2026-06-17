import { createRedisConnection } from "@redis-client";
import type { RedisClientType } from "redis";
import type { EngineEvents } from "@shared-types/src";
export class RedisManager {
  private redisClient?: RedisClientType | null;
  public publisherClient?: RedisClientType | null;

  async connect() {
    console.log("trying to connect engine redis client");
    this.redisClient = await createRedisConnection();

    if (!this.redisClient) {
      throw new Error("Redis client failed to connect");
    }

    this.publisherClient = this.redisClient.duplicate() as RedisClientType;
    await this.publisherClient.connect();

    console.log("engine publisher redis client connected");
  }

  async listenToBinanceWS(callBack:((data: {marketId:string, indexPrice:number})=> void)):Promise<void> {
    if (!this.redisClient) {
      throw new Error("Redis client is not connected");
    }

    console.log("trying to listen for engine stream messages");

    await this.redisClient.subscribe("binance-markprices", (data: string) => {
      const parsed = JSON.parse(data);
      callBack({ marketId: parsed.s, indexPrice: Number(parsed.p) })
    });
    return 
  }


  async publish(channel:string, data:EngineEvents) {
    if (!this.publisherClient) {
      throw new Error("Redis publisher client is not connected");
    }
    // we are sending this to ws server => we need to send depthUpdates | tradeUpdates | positionUpdates | tickerUpdates

    console.log("trying to publish");
    await this.publisherClient.publish(channel, JSON.stringify(data));
    console.log("Published:", data, " to ", channel);
  }

  getPublisherClient() {
    if (!this.publisherClient) {
      throw new Error("");
    }

    return this.publisherClient;
  }

  async readFromBackendServer(){
    const data = await this.redisClient?.xRead([{key: "send-to-engine", id: "$" }], {BLOCK: 0})
    return data
  }
  
  createChannel(channel: string, market: string, userId?: string) {
    if (channel === "position") {
      if (!userId) {
        throw new Error("userId is required for position channels");
      }
      return `${channel}:${userId}:${market}`;
    }

    return `${channel}:${market}`;
  }
}
