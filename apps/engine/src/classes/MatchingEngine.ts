import type { Order } from "@shared-types";
import type { FillManager } from "./FillManager";
import type { OrderBook } from "./OrderBook";
import type { LinkList } from "js-sdsl";
import type { PositionManager } from "./PositionManager";
import type { RiskManager } from "./RiskManager";
import type { PositionType } from "@prisma-db/generated/prisma/enums";

export class MatchingEngine {
  constructor(
    private orderBook: OrderBook,
    private fillsManager: FillManager,
    private positionManager: PositionManager,
    private riskManager: RiskManager,
  ) {}

  matchOrder(order: Order) {
    const book = this.orderBook.getBook(order.marketId);
    const response:any = {
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
        throw new Error("-");
      }

      const { tradeQty, restingOrder } = this.orderBook.updateRemainingQty(
        order,
        bestPrice,
      );

      

      response.remainingQty -= tradeQty

      const createFillObject = {
        maker: restingOrder.userId,
        taker: order.userId,
        marketId: order.marketId,
        qty: tradeQty,
        price: bestPrice,
      };

      this.fillsManager.createFill(createFillObject);
      response.fills.push(createFillObject)

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
      response.margin.locked = takerMargin

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
      let position = {
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

      const makerPosition = {
        marketId: restingOrder.marketId,
        positionType: (order.positionType === "LONG"
          ? "SHORT"
          : "LONG") as PositionType,
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
        this.positionManager.addPosition(order.userId, position);
      } else {
        this.positionManager.manipulatePositions(
          position,
          existingPositionTaker,
          order.userId,
        );
      }

      if (!existingPositionMaker) {
        this.positionManager.addPosition(restingOrder.userId, makerPosition);
      } else
        this.positionManager.manipulatePositions(
          makerPosition,
          existingPositionMaker,
          restingOrder.userId,
        );
    }
    if (order.remainingQty === 0) {
      response.status = "filled"
      return response
    }
  }
}

// makerPositions         exists           =>             => Yes   check side =>  update
// takerPositions         may/maynot exist => No ? Add    => Yes ? check side =>  update
// incommingPositions
