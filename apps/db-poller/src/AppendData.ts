import db from "@prisma-db";
import type { OrderStatus, OrderType } from "@prisma-db";
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
  return "OPEN";
}

function getOrderData(order: Order) {
  return {
    userId: order.userId,
    price: order.price,
    qty: order.qty,
    leverage: order.leverage,
    Margin: (order.price * order.qty) / order.leverage,
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
    pnL: incommingData.position.pnL,
    entryPrice: incommingData.position.entryPrice,
    averagePrice: incommingData.position.averagePrice,
    unrealisedPnL: incommingData.position.unrealisedPnL,
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

    await db.positions.deleteMany({
      where: {
        userId: incommingData.userId,
        marketId: incommingData.position.marketId,
      },
    });
  }

  async order(payload: dbPollerEvents) {
    if (!isOrder(payload.payload.data)) {
      throw new Error("OrderUpdate payload must contain order data");
    }

    const order = payload.payload.data;

    if (payload.payload.method === "POST") {
      await db.orders.create({
        data: {
          id: order.orderId,
          ...getOrderData(order),
        },
      });
      return;
    }

    if (payload.payload.method === "PUT") {
      await db.orders.update({
        where: {
          id: order.orderId,
        },
        data: getOrderData(order),
      });
      return;
    }

    await db.orders.delete({
      where: {
        id: order.orderId,
      },
    });
  }

  async fills(payload: dbPollerEvents) {
    if (!isFill(payload.payload.data)) {
      throw new Error("FillsCreated payload must contain fills data");
    }

    if (payload.payload.method === "DELETE") {
      throw new Error("FillsCreated does not support DELETE");
    }

    const fill = payload.payload.data;
    const order = await db.orders.findFirst({
      where: {
        marketId: fill.marketId,
        userId: fill.taker,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!order) {
      throw new Error("No order found for fill");
    }

    const remainingQty = Math.max(order.qty - fill.qty, 0);

    await db.fills.create({
      data: {
        userId: fill.taker,
        marketId: fill.marketId,
        orderId: order.id,
        makerId: fill.maker,
        takerId: fill.taker,
        filledQty: fill.qty,
        remainingQty,
      },
    });
  }
}
