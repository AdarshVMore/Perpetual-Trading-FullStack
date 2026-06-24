import db from "@prisma-db";
import type { OrderStatus, OrderType } from "@prisma-db";
import type { PositionStatus } from "@prisma-db";
import type { CustomPosition, dbPollerEvents, Fills, Order } from "@shared-types/src";

type DbPollerData = Order | CustomPosition | Fills;

function isCustomPosition(data: DbPollerData): data is CustomPosition {
  return "position" in data;
}

function isOrder(data: DbPollerData): data is Order {
  return "orderId" in data;
}

function isFill(data: DbPollerData): data is Fills {
  return "maker" in data && "taker" in data;
}

function mapOrderStatus(status: Order["status"]): OrderStatus {
  if (status === "FILLED") return "FILLED";
  if (status === "PARTIAL_FILLED") return "PARTIALLY_FILLED";
  if (status === "CANCLE") return "CANCLED";
  return "OPEN";
}

async function ensureUserExists(userId: string) {
  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: `${userId}@placeholder.com`,
      password: "placeholder",
      role: "user"
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

function getOrderData(order: Order) {
  return {
    userId: order.userId,
    price: order.price ?? 0,
    qty: order.qty,
    leverage: order.leverage,
    margin: ((order.price ?? 0) * order.qty) / order.leverage,
    marketId: order.marketId,
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
    }
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

    // Ensure taker's order exists in DB before creating fill
    await db.orders.upsert({
      where: { id: fill.takerOrderId },
      create: {
        id: fill.takerOrderId,
        userId: fill.taker,
        marketId: fill.marketId,
        qty: fill.qty,
        leverage: 1,
        orderType: "MARKET",
        orderStatus: "FILLED",
      },
      update: {},
    });

    const remainingQty = 0;

    await db.fills.create({
      data: {
        userId: fill.taker,
        marketId: fill.marketId,
        orderId: fill.takerOrderId,
        makerId: fill.maker,
        takerId: fill.taker,
        originalQty: fill.qty,
        filledQty: fill.qty,
        remainingQty,
      },
    });
  }
}
