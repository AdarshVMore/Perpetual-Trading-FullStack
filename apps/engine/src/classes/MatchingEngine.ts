import type {
  dbPollerEvents,
  Fills,
  Order,
  positionType,
  User,
  UserPositions,
} from "@shared-types";
import type { FillManager } from "./FillManager";
import type { OrderBook } from "./OrderBook";
import type { LinkList } from "js-sdsl";
import type { PositionManager } from "./PositionManager";
import type { RiskManager } from "./RiskManager";
import type { RedisManager } from "./RedisManager";
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
  ) {}

  setDBPoller(dbpoller: DBPoller) {
    this.dbpoller = dbpoller;
  }

  matchOrder(order: Order) {
    const book = this.orderBook.getBook(order.marketId);
    const createDBPollerOrderCreatedObject: dbPollerEvents = {
      type: "OrderUpdate",
      payload: { method: "POST", data: order },
    };
    this.dbpoller?.sendToDBPoller(createDBPollerOrderCreatedObject);

    const orderCreateEvent: orderUpdates = {
      type: "orderCreate",
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
    const orderChannel = this.redisManager.createChannel("order", order.marketId);
    void this.redisManager.publish(orderChannel, orderCreateEvent);

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
    while (order.remainingQty > 0) {
      const bestPrice = this.orderBook.getBestPrice(order.positionType, book);
      if (!bestPrice) {
        break;
      }

      const { tradeQty, restingOrder } = this.orderBook.updateRemainingQty(
        order,
        bestPrice,
      );

      response.remainingQty -= tradeQty;

      const createFillObject: Fills = {
        maker: restingOrder.userId,
        taker: order.userId,
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

      // Limit Order
      // Market Order
      // Add to Book

      const existingPositionMaker = this.positionManager.getPosition(
        restingOrder.userId,
        order.marketId,
      );
      const existingPositionTaker = this.positionManager.getPosition(
        order.userId,
        order.marketId,
      );
      const takerMargin = (tradeQty * bestPrice) / order.leverage;
      response.margin.locked = takerMargin;

      const makerMargin = (tradeQty * bestPrice) / restingOrder.leverage;

      const takerMaintainanceMargin =
        this.riskManager.calculateMaintainanceMargin(takerMargin);
      const makerMaintainanceMargin =
        this.riskManager.calculateMaintainanceMargin(makerMargin);
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
        margin: takerMargin,
        maintainanceMargin: takerMaintainanceMargin,
        liquidationPrice: TakerLiquidationPrice,
        pnL: 0,
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
        margin: makerMargin,
        maintainanceMargin: makerMaintainanceMargin,
        liquidationPrice: MakerLiquidationPrice,
        pnL: 0,
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
    }

    const depth = this.orderBook.getDepth(order.marketId);
    const depthEvent: depthUpdates = {
      type: "depth",
      market: order.marketId,
      asks: depth.asks,
      bids: depth.bids,
    };
    const depthChannel = this.redisManager.createChannel("depth", order.marketId);
    void this.redisManager.publish(depthChannel, depthEvent);

    if (order.remainingQty === 0) {
      response.status = "filled";
      order.status = "FILLED";
      const createDBPollerUpdateOrderObject: dbPollerEvents = {
        type: "OrderUpdate",
        payload: { method: "PUT", data: order },
      };
      this.dbpoller?.sendToDBPoller(createDBPollerUpdateOrderObject);

      const orderUpdateEvent: orderUpdates = {
        type: "orderUpdate",
        orderId: order.orderId,
        userId: order.userId,
        marketId: order.marketId,
        positionType: order.positionType,
        price: order.price,
        qty: order.qty,
        remainingQty: order.remainingQty,
        leverage: order.leverage,
        status: "FILLED",
      };
      void this.redisManager.publish(orderChannel, orderUpdateEvent);

      return response;
    }
  }
}

// makerPositions         exists           =>             => Yes   check side =>  update
// takerPositions         may/maynot exist => No ? Add    => Yes ? check side =>  update
// incommingPositions

/*
  OrderUpdate
  FillsCreated
  PositionUpdated for add
  PositionUpdated for update and cancel
  OrderUpdate
*/
