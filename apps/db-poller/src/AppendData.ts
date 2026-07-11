import db from "@prisma-db";
import type { OrderStatus, OrderType } from "@prisma-db";
import type { PositionStatus } from "@prisma-db";
import type { CustomBalance, CustomPosition, CreateMarket, dbPollerEvents, Fills, Order } from "@shared-types/src";

type DbPollerData = Order | CustomPosition | Fills | CustomBalance | CreateMarket;

function isCustomPosition(data: DbPollerData): data is CustomPosition {
  return "position" in data;
}

function isOrder(data: DbPollerData): data is Order {
  return "orderId" in data;
}

function isFill(data: DbPollerData): data is Fills {
  return "maker" in data && "taker" in data;
}

function isBalance(data: DbPollerData): data is CustomBalance {
  return "availableBalance" in data && "lockedBalance" in data;
}

function isMarket(data: DbPollerData): data is CreateMarket {
  return "marketName" in data && "maxLeverage" in data;
}

function mapOrderStatus(status: Order["status"]): OrderStatus {
  if (status === "FILLED") return "FILLED";
  if (status === "PARTIAL_FILLED") return "PARTIALLY_FILLED";
  if (status === "CANCLE") return "CANCLED";
  return "OPEN";
}

async function ensureUserExists(userId: string) {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (existing) return;

  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@placeholder.com`,
      password: "placeholder",
      role: "user",
      userBalance: {
        create: {
          availableBalance: 1_000_000,
          lockedBalance: 0,
        },
      },
    },
  });
}

async function ensureMarketExists(marketId: string) {
  await db.markets.upsert({
    where: { id: marketId },
    update: {},
    create: {
      id: marketId,
      symbol: marketId,
      market: marketId,
      maxLeverage: 10,
    },
  });
}

function resolvedStoredPrice(
  existingPrice: number | null | undefined,
  executionPrice?: number,
): number | null {
  if (existingPrice != null && existingPrice > 0) {
    return existingPrice;
  }
  if (executionPrice != null && executionPrice > 0) {
    return executionPrice;
  }
  return null;
}

function resolveOrderPrice(
  order: Order,
  executionPrice?: number,
): number | null {
  return resolvedStoredPrice(order.price, executionPrice);
}

function getOrderData(order: Order) {
  const price = resolveOrderPrice(order);
  return {
    userId: order.userId,
    price,
    qty: order.qty,
    remainingQty: order.remainingQty,
    leverage: order.leverage,
    margin: price != null ? (price * order.qty) / order.leverage : null,
    marketId: order.marketId,
    positionType: order.positionType,
    orderType: order.marketType as OrderType,
    orderStatus: mapOrderStatus(order.status),
  };
}

function getPositionData(incommingData: CustomPosition) {
  return {
    userId: incommingData.userId,
    marketId: incommingData.position.marketId,
    positionType: incommingData.position.positionType,
    qty: incommingData.position.qty,
    leverage: incommingData.position.leverage,
    margin: incommingData.position.margin,
    maintainanceMargin: incommingData.position.maintainanceMargin,
    liquidationPrice: incommingData.position.liquidationPrice,
    realisedPnL: incommingData.position.realisedPnL,
    entryPrice: incommingData.position.entryPrice,
    averagePrice: incommingData.position.averagePrice,
    unrealisedPnL: incommingData.position.unrealisedPnL,
    status: "OPEN" as PositionStatus,
  };
}

export class AppendData {
  private payload: dbPollerEvents;

  constructor(payload: dbPollerEvents) {
    this.payload = payload;
  }

  async manipulateDB(payload: dbPollerEvents = this.payload) {
    if (payload.type === "FillsCreated") {
      await this.fills(payload);
      return;
    }

    if (payload.type === "OrderUpdate" || payload.type === "TradeExecuted") {
      await this.order(payload);
      return;
    }

    if (payload.type === "PositionUpdated") {
      await this.position(payload);
      return;
    }

    if (payload.type === "BalanceUpdated") {
      await this.balance(payload);
      return;
    }

    if (payload.type === "MarketCreated") {
      await this.market(payload);
    }
  }

  async balance(payload: dbPollerEvents) {
    if (!isBalance(payload.payload.data)) {
      throw new Error("BalanceUpdated payload must contain balance data");
    }

    const data = payload.payload.data;
    await ensureUserExists(data.userId);

    await db.userBalance.upsert({
      where: { userId: data.userId },
      create: {
        userId: data.userId,
        availableBalance: data.availableBalance,
        lockedBalance: data.lockedBalance,
      },
      update: {
        availableBalance: data.availableBalance,
        lockedBalance: data.lockedBalance,
      },
    });
  }

  async market(payload: dbPollerEvents) {
    if (!isMarket(payload.payload.data)) {
      throw new Error("MarketCreated payload must contain market data");
    }

    const data = payload.payload.data;
    await db.markets.upsert({
      where: { id: data.marketId },
      create: {
        id: data.marketId,
        symbol: data.symbol || data.marketId,
        market: data.marketName,
        maxLeverage: parseInt(data.maxLeverage) || 10,
      },
      update: {
        symbol: data.symbol || data.marketId,
        market: data.marketName,
        maxLeverage: parseInt(data.maxLeverage) || 10,
      },
    });
  }

  async position(payload: dbPollerEvents) {
    if (!isCustomPosition(payload.payload.data)) {
      throw new Error("Position Updated payload must contain position data");
    }

    const incommingData = payload.payload.data;
    const positionData = getPositionData(incommingData);

    if (payload.payload.method === "POST") {
      await db.positions.create({
        data: positionData,
      });
      return;
    }

    if (payload.payload.method === "PUT") {
      await db.positions.updateMany({
        where: {
          userId: incommingData.userId,
          marketId: incommingData.position.marketId,
        },
        data: positionData,
      });
      return;
    }

    if(payload.payload.method === "DELETE"){
      await db.positions.deleteMany({
        where: {
          userId: incommingData.userId,
          marketId: incommingData.position.marketId,
        },
      });
      return;
    }
  }

  async order(payload: dbPollerEvents) {
    if (!isOrder(payload.payload.data)) {
      throw new Error("OrderUpdate payload must contain order data");
    }

    const order = payload.payload.data;
    await ensureUserExists(order.userId);
    await ensureMarketExists(order.marketId);

    if (payload.payload.method === "POST") {
      await db.orders.upsert({
        where: { id: order.orderId },
        create: { id: order.orderId, ...getOrderData(order) },
        update: getOrderData(order),
      });
      return;
    }

    if (payload.payload.method === "PUT") {
      await db.orders.upsert({
        where: { id: order.orderId },
        create: { id: order.orderId, ...getOrderData(order) },
        update: getOrderData(order),
      });
      return;
    }

    if (payload.payload.method === "DELETE") {
      await db.orders.delete({
        where: { id: order.orderId },
      });
      return;
    }
  }

  async fills(payload: dbPollerEvents) {
    if (!isFill(payload.payload.data)) {
      throw new Error("FillsCreated payload must contain fills data");
    }

    if (payload.payload.method === "DELETE") {
      throw new Error("FillsCreated does not support DELETE");
    }

    const fill = payload.payload.data;
    await ensureUserExists(fill.taker);
    await ensureUserExists(fill.maker);
    await ensureMarketExists(fill.marketId);

    const existingTaker = await db.orders.findUnique({
      where: { id: fill.takerOrderId },
    });
    const takerPrice = resolvedStoredPrice(existingTaker?.price, fill.price);

    await db.orders.upsert({
      where: { id: fill.takerOrderId },
      create: {
        id: fill.takerOrderId,
        userId: fill.taker,
        marketId: fill.marketId,
        price: takerPrice,
        qty: existingTaker?.qty ?? fill.qty,
        remainingQty: 0,
        leverage: existingTaker?.leverage ?? 1,
        margin:
          takerPrice != null
            ? (takerPrice * (existingTaker?.qty ?? fill.qty)) /
              (existingTaker?.leverage ?? 1)
            : null,
        positionType: existingTaker?.positionType ?? "LONG",
        orderType: existingTaker?.orderType ?? "MARKET",
        orderStatus: "FILLED",
      },
      update: {
        price: takerPrice,
        remainingQty: 0,
        orderStatus: "FILLED",
      },
    });

    await db.fills.create({
      data: {
        userId: fill.taker,
        marketId: fill.marketId,
        orderId: fill.takerOrderId,
        makerId: fill.maker,
        takerId: fill.taker,
        price: fill.price,
        originalQty: fill.qty,
        filledQty: fill.qty,
        remainingQty: 0,
      },
    });
  }
}
