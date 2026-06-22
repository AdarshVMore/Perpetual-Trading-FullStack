import { createRedisConnection } from "@redis-client";
import type { RedisClientType } from "redis";
import type { EngineEvents } from "@shared-types/src";

export class RedisManager {
  private subscriberClient?: RedisClientType | null;
  private streamClient?: RedisClientType | null;
  public publisherClient?: RedisClientType | null;

  async connect() {
    this.streamClient = await createRedisConnection();

    if (!this.streamClient) {
      throw new Error("Redis client failed to connect");
    }

    this.subscriberClient = this.streamClient.duplicate() as RedisClientType;
    await this.subscriberClient.connect();

    this.publisherClient = this.streamClient.duplicate() as RedisClientType;
    await this.publisherClient.connect();

    console.log("engine redis clients connected");
  }

  async listenToBinanceWS(callBack:((data: {marketId:string, indexPrice:number})=> void)):Promise<void> {
    if (!this.subscriberClient) {
      throw new Error("Redis subscriber client is not connected");
    }


    await this.subscriberClient.subscribe("binance-markprices", (data: string) => {
      const parsed = JSON.parse(data);
      callBack({ marketId: parsed.s, indexPrice: Number(parsed.p) })
    });
  }


  async publish(channel:string, data:EngineEvents) {
    if (!this.publisherClient) {
      throw new Error("Redis publisher client is not connected");
    }
    await this.publisherClient.publish(channel, JSON.stringify(data));
  }

  getPublisherClient() {
    if (!this.publisherClient) {
      throw new Error("Publisher client is not connected");
    }

    return this.publisherClient;
  }

  async readFromBackendServer(){
    const data = await this.streamClient?.xRead([{key: "send-to-engine", id: "$" }], {BLOCK: 0})
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
