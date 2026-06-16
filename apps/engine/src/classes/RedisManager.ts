import { EngineServer } from "./EngineServer";
import { createRedisConnection } from "@redis-client";
import type { RedisArgument, RedisClientType } from "redis";
import type { dbPollerEvents, dbPollerPayload } from "@shared-types/src";
import { LiquidationManager } from "./LiquidationManager";
export class RedisManager {
  private engineServer;
  private liquidationManager;
  private redisClient?: RedisClientType | null;
  public publisherClient?: RedisClientType | null;

  constructor(
    engineServer: EngineServer,
    liquidationManager: LiquidationManager,
  ) {
    this.engineServer = engineServer;
    this.liquidationManager = liquidationManager;
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

    await this.redisClient.subscribe("binance-markprices", (data: any) => {
      this.liquidationManager.start(data.s, data.p);
    });

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

  publish() {
    if (!this.publisherClient) {
      throw new Error("Redis publisher client is not connected");
    }
    // we are sending this to ws server => we need to send depthUpdates | tradeUpdates | positionUpdates | tickerUpdates

    console.log("trying to publish");
    setInterval(async () => {
      // const update = {
      //   userId: "user123",
      //   unrealizedPnL: (Math.random() * 500 - 250).toFixed(2),
      //   timestamp: Date.now(),
      // };
      // await this.publisherClient?.publish(
      //   "depth:BTCUSDT",
      //   JSON.stringify(update),
      // );
      // console.log("Published:", update);
    }, 2000);
  }

  getPublisherClient() {
    if (!this.publisherClient) {
      throw new Error("");
    }

    return this.publisherClient;
  }
}
