import { Router } from "express";
import type { Response, Request } from "express";
import { authAdminMiddleware } from "../middleware/auth";
import { createRedisConnection } from "@redis-client";
import type { RedisClientType } from "redis";
import db from "@prisma-db";
import crypto from "crypto";
import {
  CreateOrderSchema,
  cancleOrdersSchema,
  createMarketSchema,
} from "@shared-types";
const routes = Router();

let redisClient: RedisClientType | null;

export async function connectRedisBackend() {
  redisClient = await createRedisConnection();
  console.log("connected backend with redis");
  return redisClient;
}

connectRedisBackend();

routes.post("/create-order", async (req: Request, res: Response) => {
  console.log("recieved the order...");
  const result = CreateOrderSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.flatten(),
    });
  }

  const { userId, price, qty, marketId, orderType, positionType, leverage } =
    result.data;

  if (!redisClient) {
    res.status(400).json({ message: "unable to start redis" });
    return;
  }

  const orderId = crypto.randomUUID();

  const res1 = await redisClient.XADD("send-to-engine", "*", {
    type: "create-order",
    reqId: crypto.randomUUID(),
    orderId: orderId,
    userId: userId,
    marketId: marketId,
    qty: qty.toString(),
    price: price.toString(),
    leverage: leverage.toString(),
    remainingQty: qty.toString(),
    orderType: orderType,
    positionType: positionType,
    status: "OPEN",
  });

  res
    .status(200)
    .json({ message: `order Accepted`, orderId, queueId: res1 });
});

routes.post("/cancle-order/:orderId", async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId ?? "");
  if (!orderId) {
    return res.status(400).json({ message: "orderId required" });
  }

  const result = cancleOrdersSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.flatten(),
    });
  }

  if (!redisClient) {
    res.status(400).json({ message: "unable to start redis" });
    return;
  }

  const { userId, marketId, price, positionType, qty, leverage, orderType } =
    result.data;

  await redisClient.XADD("send-to-engine", "*", {
    type: "cancle-order",
    orderId: orderId,
    userId: userId,
    marketId: marketId,
    price: price.toString(),
    qty: qty.toString(),
    leverage: leverage.toString(),
    orderType: orderType,
    positionType: positionType,
  });
  res.status(200).json({ message: "request accepted to cancle the order" });
});

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

    if (!redisClient) {
      res.status(400).json({ message: "unable to start redis" });
      return;
    }

    const res1 = await redisClient.xAdd("send-to-engine", "*", {
      type: "create-market",
      marketId: marketId,
      marketName: marketName,
      maxLeverage: maxLeverage.toString(),
      symbol: symbol,
    });
    res.status(200).json({ message: `recieved ${res1}` });
  },
);

routes.get("/get-orders/:marketId", async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res
      .status(400)
      .json({ message: "marketId required for get-orders api via marketId" });
  }
  const userId = req.query.userId as string | undefined;
  const orders = await db.orders.findMany({ where: { marketId, ...(userId ? { userId } : {}) } });
  res.status(200).json({ orders: orders });
});

routes.get("/get-order/:orderId", async (req: Request, res: Response) => {
  const orderId = req.params.orderId;
  if (typeof orderId !== "string") {
    return res.status(400).json({
      message: "orderId as string is required for get-order via orderId",
    });
  }
  const order = await db.orders.findUnique({ where: { id: orderId } });
  res.status(200).json({ order: order });
});

routes.get("/get-fills/:marketId", async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res
      .status(400)
      .json({ message: "marketId is required to get the fills" });
  }
  const fills = await db.fills.findMany({ where: { marketId } });
  res.status(200).json({ fills: fills });
});

export default routes;
