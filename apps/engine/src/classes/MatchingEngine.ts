import type {
  dbPollerEvents,
  Fills,
  Order,
  positionType,
  UserPositions,
} from "@shared-types";
import type { FillManager } from "./FillManager";
import type { OrderBook } from "./OrderBook";
import type { PositionManager } from "./PositionManager";
import type { RiskManager } from "./RiskManager";
import type { RedisManager } from "./RedisManager";
import type { UserManager } from "./UserManager";
import type { orderUpdates, tradeUpdates, depthUpdates } from "@shared-types/src/ws/ws.types";
import { DBPoller } from "./DBPollerManager";

export class MatchingEngine {
  private dbpoller?: DBPoller;
  constructor(
    private orderBook: OrderBook,
    private fillsManager: FillManager,
    private positionManager: PositionManager,
    private riskManager: RiskManager,
    private redisManager: RedisManager,
    private userManager: UserManager,
  ) {}

  setDBPoller(dbpoller: DBPoller) {
    this.dbpoller = dbpoller;
  }

  private publishOrderUpdate(order: Order, orderChannel: string, type: "orderCreate" | "orderUpdate") {
    const orderEvent: orderUpdates = {
      type,
      orderId: order.orderId,
      userId: order.userId,
      marketId: order.marketId,
      positionType: order.positionType,
      price: order.price,
      qty: order.qty,
      remainingQty: order.remainingQty,
      leverage: order.leverage,
      status: order.status,
    };
    void this.redisManager.publish(orderChannel, orderEvent);
  }

  private sendOrderDBUpdate(order: Order) {
    const createDBPollerUpdateOrderObject: dbPollerEvents = {
      type: "OrderUpdate",
      payload: { method: "PUT", data: order },
    };
    this.dbpoller?.sendToDBPoller(createDBPollerUpdateOrderObject);
  }

  private persistMakerOrderUpdate(restingOrder: Order) {
    if (restingOrder.remainingQty === 0) {
      restingOrder.status = "FILLED";
    } else {
      restingOrder.status = "PARTIAL_FILLED";
    }
    this.sendOrderDBUpdate(restingOrder);
  }

  private publishDepth(marketId: string) {
    const depth = this.orderBook.getDepth(marketId);
    const depthEvent: depthUpdates = {
      type: "depth",
      market: marketId,
      asks: depth.asks,
      bids: depth.bids,
    };
    const depthChannel = this.redisManager.createChannel("depth", marketId);
    void this.redisManager.publish(depthChannel, depthEvent);
  }

  private applyExecutionPrice(order: Order, tradeQty: number, tradePrice: number) {
    if (order.marketType !== "MARKET") return;

    const filledQty = order.qty - order.remainingQty;
    const priorFilledQty = filledQty - tradeQty;
    const priorNotional =
      order.price != null && priorFilledQty > 0
        ? order.price * priorFilledQty
        : 0;
    const totalFilledQty = priorFilledQty + tradeQty;
    order.price = (priorNotional + tradeQty * tradePrice) / totalFilledQty;
  }

  matchOrder(order: Order) {
    const book = this.orderBook.getBook(order.marketId);
    const createDBPollerOrderCreatedObject: dbPollerEvents = {
      type: "OrderUpdate",
      payload: { method: "POST", data: order },
    };
    this.dbpoller?.sendToDBPoller(createDBPollerOrderCreatedObject);

    const orderChannel = this.redisManager.createChannel("order", order.marketId, order.userId);
    this.publishOrderUpdate(order, orderChannel, "orderCreate");

    const response: any = {
      orderId: order.orderId,
      status: "",
      fills: [],
      remainingQuantity: order.qty,
      cancelledQuantity: 0,
      margin: {
        locked: 0,
        used: 0,
        released: 0,
      },
    };
    if (!book) {
      throw new Error(`book ith ${order.marketId} does not exist`);
    }
    let staleMatches = 0;
    while (order.remainingQty > 0) {
      const bestPrice = this.orderBook.getBestPrice(order.positionType, book);
      if (!bestPrice) {
        break;
      }

      if (order.marketType === "LIMIT" && order.price !== undefined) {
        if (order.positionType === "LONG" && bestPrice > order.price) break;
        if (order.positionType === "SHORT" && bestPrice < order.price) break;
      }

      const match = this.orderBook.updateRemainingQty(order, bestPrice);
      if (!match) {
        staleMatches++;
        if (staleMatches > 100) break;
        continue;
      }
      staleMatches = 0;
      const { tradeQty, restingOrder } = match;

      this.orderBook.updateLastTradedPrice(order.marketId, bestPrice);
      this.applyExecutionPrice(order, tradeQty, bestPrice);

      response.remainingQty -= tradeQty;

      const createFillObject: Fills = {
        maker: restingOrder.userId,
        taker: order.userId,
        makerOrderId: restingOrder.orderId,
        takerOrderId: order.orderId,
        marketId: order.marketId,
        qty: tradeQty,
        price: bestPrice,
      };
      const createDBPollerFillObject: dbPollerEvents = {
        type: "FillsCreated",
        payload: { method: "POST", data: createFillObject },
      };

      this.fillsManager.createFill(createFillObject);
      response.fills.push(createFillObject);
      this.dbpoller?.sendToDBPoller(createDBPollerFillObject);

      const tradeEvent: tradeUpdates = {
        type: "trades",
        marketId: order.marketId,
        price: bestPrice,
        qty: tradeQty,
        maker: restingOrder.userId,
        taker: order.userId,
        timestamp: Date.now(),
      };
      const tradeChannel = this.redisManager.createChannel("trade", order.marketId);
      void this.redisManager.publish(tradeChannel, tradeEvent);

      // Margin locked at order time stays locked as the position's margin once
      // a fill opens/increases a position. PositionManager releases it back to
      // available on reduce/close, so we must NOT release it here.
      const takerFillMargin = (tradeQty * bestPrice) / order.leverage;
      const makerFillMargin = (tradeQty * bestPrice) / restingOrder.leverage;

      response.margin.locked = takerFillMargin;

      const existingPositionMaker = this.positionManager.getPosition(
        restingOrder.userId,
        order.marketId,
      );
      const existingPositionTaker = this.positionManager.getPosition(
        order.userId,
        order.marketId,
      );

      const takerMaintainanceMargin =
        this.riskManager.calculateMaintainanceMargin(takerFillMargin);
      const makerMaintainanceMargin =
        this.riskManager.calculateMaintainanceMargin(makerFillMargin);
      const TakerLiquidationPrice = this.riskManager.calculateLiquidationMargin(
        bestPrice,
        order.leverage,
        order.positionType,
      );
      const MakerLiquidationPrice = this.riskManager.calculateLiquidationMargin(
        bestPrice,
        restingOrder.leverage,
        restingOrder.positionType,
      );
      let position: UserPositions = {
        marketId: order.marketId,
        positionType: order.positionType,
        qty: tradeQty,
        leverage: order.leverage,
        margin: takerFillMargin,
        maintainanceMargin: takerMaintainanceMargin,
        liquidationPrice: TakerLiquidationPrice,
        pnL: 0,
        realisedPnL: 0,
        entryPrice: bestPrice,
        averagePrice: bestPrice,
        unrealisedPnL: 0,
      };

      const makerPosition: UserPositions = {
        marketId: restingOrder.marketId,
        positionType: (order.positionType === "LONG"
          ? "SHORT"
          : "LONG") as positionType,
        qty: tradeQty,
        leverage: restingOrder.leverage,
        margin: makerFillMargin,
        maintainanceMargin: makerMaintainanceMargin,
        liquidationPrice: MakerLiquidationPrice,
        pnL: 0,
        realisedPnL: 0,
        entryPrice: bestPrice,
        averagePrice: bestPrice,
        unrealisedPnL: 0,
      };

      if (!existingPositionTaker) {
        this.positionManager.newPosition(order.userId, position);
        const createDBPollerMakerPositionObject: dbPollerEvents = {
          type: "PositionUpdated",
          payload: {
            method: "POST",
            data: { userId: order.userId, position: position },
          },
        };
        this.dbpoller?.sendToDBPoller(createDBPollerMakerPositionObject);
      } else {
        this.positionManager.manipulatePositions(
          position,
          existingPositionTaker,
          order.userId,
        );
      }

      if (!existingPositionMaker) {
        this.positionManager.newPosition(restingOrder.userId, makerPosition);
        const createDBPollerTakerPositionObject: dbPollerEvents = {
          type: "PositionUpdated",
          payload: {
            method: "POST",
            data: { userId: restingOrder.userId, position: makerPosition },
          },
        };
        this.dbpoller?.sendToDBPoller(createDBPollerTakerPositionObject);
      } else {
        this.positionManager.manipulatePositions(
          makerPosition,
          existingPositionMaker,
          restingOrder.userId,
        );
      }

      this.persistMakerOrderUpdate(restingOrder);
    }

    if (order.marketType === "LIMIT" && order.remainingQty > 0) {
      this.orderBook.addToBook(order);
    }

    this.publishDepth(order.marketId);

    const filledQty = order.qty - order.remainingQty;

    if (order.remainingQty === 0) {
      response.status = "filled";
      order.status = "FILLED";
      this.sendOrderDBUpdate(order);
      this.publishOrderUpdate(order, orderChannel, "orderUpdate");
      return response;
    }

    if (filledQty > 0) {
      order.status = "PARTIAL_FILLED";
      this.sendOrderDBUpdate(order);
      this.publishOrderUpdate(order, orderChannel, "orderUpdate");
    }

    return response;
  }
}
