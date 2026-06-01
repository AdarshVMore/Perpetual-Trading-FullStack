import { EngineServer } from "./EngineServer";
import { createRedisConnection } from "@redis-client";
import type { RedisClientType } from "redis";
import type { Order } from "@shared-types";

export class RedisManager {
  private engineServer;
  private redisClient?: RedisClientType | null;

  constructor(engineServer: EngineServer) {
    this.engineServer = engineServer;
  }

  async connect() {
    this.redisClient = await createRedisConnection();
  }

  listen() {
    setInterval(async () => {
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
    }, 1000);
  }

  publish(){
    setInterval(async () => {
    const update = {
      userId: "user123",
      unrealizedPnL: (
        Math.random() * 500 - 250
      ).toFixed(2),
      timestamp: Date.now(),
    };

    await this.redisClient?.publish(
      "depth:BTCUSDT",
      JSON.stringify(update)
    );

    console.log("Published:", update);
  }, 2000);
  }
}
