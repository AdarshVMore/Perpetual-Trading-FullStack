import { EngineServer } from "./EngineServer";
import { createRedisConnection } from "@redis-client";
import type { RedisArgument, RedisClientType } from "redis";
import type { dbPollerPayload } from "@shared-types/src";
export class RedisManager {
  private engineServer;
  private redisClient?: RedisClientType | null;
  private publisherClient?: RedisClientType | null;

  constructor(engineServer: EngineServer) {
    this.engineServer = engineServer;
  }

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

  async listen() {
    if (!this.redisClient) {
      throw new Error("Redis client is not connected");
    }

    console.log("trying to listen for engine stream messages");

    while (true) {
      const data = await this.redisClient?.xRead(
        [
          {
            key: "send-to-engine",
            id: "$", // "$" means listen to new messages
          },
        ],
        {
          BLOCK: 0, // this means wait forever untill new message arrives
        },
      );
 
      if (data) {
        for (let stream of data) {
          for (let singleMessage of stream.messages) {
            const payload = singleMessage.message;
            this.engineServer.createOrder(payload);
          }
        }
      }
    }
  }

  async sendToDBPoller(payloadData:dbPollerPayload){
    if(!payloadData){
      return
    }
    const res = await this.redisClient?.XADD("send-to-engine", "*", {"data":payloadData.toString()})
    console.log("send response to dbpoller stream...", res)
  }

  publish() {
    if (!this.publisherClient) {
      throw new Error("Redis publisher client is not connected");
    }

    console.log("trying to publish");
    setInterval(async () => {
      const update = {
        userId: "user123",
        unrealizedPnL: (Math.random() * 500 - 250).toFixed(2),
        timestamp: Date.now(),
      };

      await this.publisherClient?.publish(
        "depth:BTCUSDT",
        JSON.stringify(update),
      );

      console.log("Published:", update);
    }, 2000);
  }
}
