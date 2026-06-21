import { Router } from "express";
import type { Response, Request } from "express";
import { authUserMiddleware, authAdminMiddleware } from "../middleware/auth";
import { createRedisConnection } from "@redis-client";
import type { RedisClientType } from "redis";
import db from "@prisma-db";
import {
  CreateOrderSchema,
  getFillsSchema,
  getOrderSchema,
  cancleOrdersSchema,
  createMarketSchema,
  type BackendEvents,
  type Order,
} from "@shared-types";
import { string } from "zod";

const routes = Router();

let redisClient: RedisClientType | null;

export async function connectRedisBackend() {
  redisClient = await createRedisConnection();
  console.log("connected backend with redis");
  return redisClient;
}

const redisStreamName = process.env.REDIS_STREAM_NAME;

console.log("name of the stream", redisStreamName);

connectRedisBackend();
routes.post("/create-order", async (req: Request, res: Response) => {
  const result = CreateOrderSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.flatten(),
    });
  }

  const userId = req.userId;
  if (!userId) {
    throw new Error("userId not found for create-order api");
  }

  const { price, qty, marketId, orderType, positionType, leverage } =
    result.data;

  console.log(userId, price, qty, marketId, orderType, positionType, leverage);

  if (!redisClient) {
    console.log("");
    res.status(400).json({ message: "unable to start redis" });
    return;
  }

  console.log("backend redis connected");

  const order:Order = {
      orderId: "",
      userId: userId,
      marketId: marketId,
      marketType: orderType,
      orderType: "",
      positionType: positionType,
      status: "OPEN",
      price: price,
      qty: qty,
      leverage: leverage,
      remainingQty: 0,
    }

  const payload: BackendEvents = {
    type: "create-market",
    data: order
  };

  let res1;

  res1 = await redisClient.XADD("send-to-engine", "*", {
    event: JSON.stringify(payload),
  }); // redis only accepts buffer | string , so cant pass numbers in redis . so added .toString() numbers

  console.log("added to send-to-engine... ", res1);
  res
    .status(200)
    .json({ message: `order Accepted here is you queue number ${res1}` });
});
routes.post(
  "/cancle-order",
  authUserMiddleware,
  async (req: Request, res: Response) => {
    const result = cancleOrdersSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: result.error.flatten(),
      });
    }
    const { price, qty, marketId, orderType, positionType, leverage } =
    result.data;
    const userId = req.userId
    if(!userId) {
        throw new Error("no user id for cancle order")
    }
    const order:Order = {
      orderId: "",
      userId: userId,
      marketId: marketId,
      marketType: orderType,
      orderType: "",
      positionType: positionType,
      status: "OPEN",
      price: price,
      qty: qty,
      leverage: leverage,
      remainingQty: 0,
    }
    const payload: BackendEvents = {
      type: "cancle-order",
      data: order
    };

    const res1 = await redisClient?.XADD("send-to-engine", "*", {
      event: JSON.stringify(payload),
    });
    console.log("cancling order...", res1);
    res.status(200).json({ message: "request accepted to cancle the order" });
  },
);
routes.post(
  "/create-market",
  authAdminMiddleware,
  async (req: Request, res: Response) => {
    const result = createMarketSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: result.error.flatten(),
      });
    }

    const { marketName, marketId, maxLeverage, symbol } = result.data;
    const payload: BackendEvents = {
      type: "create-market",
      data: {
        marketName: marketName,
        marketId: marketId,
        maxLeverage: maxLeverage.toString(),
        symbol: symbol,
      },
    };

    const res1 = await redisClient?.xAdd("send-to-engine", "*", {
      event: JSON.stringify(payload),
    });
    console.log("added to send-to-engine... ", res1);
    res.status(200).json({ message: `recieved ${res1}` });
  },
);
routes.get(
  "/get-orders/:marketId",
  authUserMiddleware,
  async (req: Request, res: Response) => {
    const marketId = req.params.marketId;
    if (typeof marketId !== "string") {
      return res
        .status(400)
        .json({ message: "marketId required for get-orders api via marketId" });
    }
    const userId = req.userId;
    const orders = await db.orders.findMany({ where: { marketId, userId } });
    res.status(200).json({ orders: orders });
  },
);
routes.get(
  "/get-order/:orderId",
  authUserMiddleware,
  async (req: Request, res: Response) => {
    const orderId = req.params.orderId;
    if (typeof orderId !== "string") {
      return res.status(400).json({
        message: "orderId as string is required fir get-order via orderId",
      });
    }
    const order = await db.orders.findUnique({ where: { id: orderId } });
    res.status(200).json({ order: order });
  },
);
routes.get(
  "/get-fills/:marketId",
  authUserMiddleware,
  async (req: Request, res: Response) => {
    const marketId = req.params.marketId;
    if (typeof marketId !== "string") {
      return res
        .status(400)
        .json({ message: "marketId is required to get the fills" });
    }
    const fills = await db.markets.findMany({ where: { id: marketId } });
    res.status(200).json({ fills: fills });
  },
);

export default routes;
