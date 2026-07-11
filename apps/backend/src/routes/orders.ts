import { Router } from "express";
import type { Response, Request } from "express";
import { authAdminMiddleware, authUserMiddleware } from "../middleware/auth";
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

routes.post("/create-order", authUserMiddleware, async (req: Request, res: Response) => {
  const result = CreateOrderSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: result.error.flatten(),
    });
  }

  const userId = req.userId!;
  const { price, qty, marketId, orderType, positionType, leverage } =
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

routes.post("/cancle-order/:orderId", authUserMiddleware, async (req: Request, res: Response) => {
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

  const userId = req.userId!;
  const { marketId, price, positionType, qty, leverage, orderType } =
    result.data;

  const dbOrder = await db.orders.findUnique({ where: { id: orderId } });
  if (dbOrder) {
    if (dbOrder.userId !== userId) {
      return res.status(403).json({ message: "not authorized to cancel this order" });
    }
    if (!["OPEN", "PARTIALLY_FILLED"].includes(dbOrder.orderStatus)) {
      return res.status(400).json({ message: "order is not open" });
    }
    if (dbOrder.marketId !== marketId) {
      return res.status(400).json({ message: "marketId does not match order" });
    }
  }

  const resolvedPrice = dbOrder?.price ?? price;
  const resolvedQty =
    dbOrder && dbOrder.remainingQty > 0
      ? dbOrder.remainingQty
      : qty > 0
        ? qty
        : dbOrder?.qty ?? qty;
  const resolvedOrderQty = dbOrder?.qty ?? qty;
  const resolvedLeverage = dbOrder?.leverage ?? leverage;
  const resolvedPositionType = dbOrder?.positionType ?? positionType;
  const resolvedOrderType = dbOrder?.orderType ?? orderType;

  await redisClient.XADD("send-to-engine", "*", {
    type: "cancle-order",
    orderId: orderId,
    userId: userId,
    marketId: marketId,
    price: resolvedPrice.toString(),
    qty: resolvedOrderQty.toString(),
    remainingQty: resolvedQty.toString(),
    leverage: resolvedLeverage.toString(),
    orderType: resolvedOrderType,
    positionType: resolvedPositionType,
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

routes.get("/get-markets", async (_req: Request, res: Response) => {
  const markets = await db.markets.findMany();
  res.status(200).json({ markets });
});

routes.get("/get-orders/:marketId", authUserMiddleware, async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res
      .status(400)
      .json({ message: "marketId required for get-orders api via marketId" });
  }
  const orders = await db.orders.findMany({ where: { marketId, userId: req.userId } });
  res.status(200).json({ orders: orders });
});

routes.get("/get-order/:orderId", authUserMiddleware, async (req: Request, res: Response) => {
  const orderId = req.params.orderId;
  if (typeof orderId !== "string") {
    return res.status(400).json({
      message: "orderId as string is required for get-order via orderId",
    });
  }
  const order = await db.orders.findUnique({ where: { id: orderId } });
  if (order && order.userId !== req.userId) {
    return res.status(403).json({ message: "not authorized" });
  }
  res.status(200).json({ order: order });
});

routes.get("/get-positions/:marketId", authUserMiddleware, async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res.status(400).json({ message: "marketId required" });
  }
  const positions = await db.positions.findMany({
    where: { marketId, userId: req.userId, status: "OPEN" },
  });
  res.status(200).json({ positions });
});

routes.get("/get-fills/:marketId", authUserMiddleware, async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res
      .status(400)
      .json({ message: "marketId is required to get the fills" });
  }
  const fills = await db.fills.findMany({ where: { marketId, userId: req.userId } });
  res.status(200).json({ fills: fills });
});

const CANDLE_VIEW_BY_TIMEFRAME = {
  "1min": "candles_1min",
  "1hour": "candles_1hour",
  "1day": "candles_1day",
} as const;

type ApiCandleTimeframe = keyof typeof CANDLE_VIEW_BY_TIMEFRAME;

interface DbCandleRow {
  bucket: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  lastTradeId: string | null;
}

routes.get("/get-candles/:marketId", async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res
      .status(400)
      .json({ message: "marketId is required to get candles" });
  }

  const timeframe = String(req.query.timeframe ?? "1min");
  if (!(timeframe in CANDLE_VIEW_BY_TIMEFRAME)) {
    return res.status(400).json({
      message: "timeframe must be one of 1min, 1hour, 1day",
    });
  }

  const parsedLimit = Number.parseInt(String(req.query.limit ?? "90"), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 500)
    : 90;

  const viewName = CANDLE_VIEW_BY_TIMEFRAME[timeframe as ApiCandleTimeframe];

  try {
    const candles = await db.$queryRawUnsafe<DbCandleRow[]>(
      `
        SELECT
          bucket,
          open,
          high,
          low,
          close,
          "lastTradeId"
        FROM ${viewName}
        WHERE "marketId" = $1
        ORDER BY bucket DESC
        LIMIT $2
      `,
      marketId,
      limit,
    );

    res.status(200).json({ candles });
  } catch (error) {
    console.error("get-candles failed", error);
    res.status(200).json({ candles: [] });
  }
});

routes.get("/get-market-fills/:marketId", async (req: Request, res: Response) => {
  const marketId = req.params.marketId;
  if (typeof marketId !== "string") {
    return res
      .status(400)
      .json({ message: "marketId is required to get market fills" });
  }

  const parsedLimit = Number.parseInt(String(req.query.limit ?? "500"), 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 2000)
    : 500;

  const fills = await db.fills.findMany({
    where: { marketId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      price: true,
      filledQty: true,
      createdAt: true,
    },
  });

  res.status(200).json({ fills });
});

export default routes;
