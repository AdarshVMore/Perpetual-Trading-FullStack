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
    if (!book) {
      throw new Error(`book ith ${order.marketId} does not exist`);
    }
    while (order.remainingQty > 0) {
      const bestPrice = this.orderBook.getBestPrice(order.positionType, book);
      if (!bestPrice) {
        break;
        throw new Error("-");
      }
      const side = order.positionType === "LONG" ? book.asks : book.bids;
      const iter = side.find(bestPrice);
      if (iter.equals(side.end())) {
        break;
      }
      const queue = iter.pointer[1];
      if (!queue) {
        break;
      }
      const restingOrder = queue.popFront();
      if (!restingOrder) {
        break;
      }
      const tradeQty = Math.min(order.remainingQty, restingOrder?.remainingQty);
      order.remainingQty -= tradeQty;
      restingOrder.remainingQty -= tradeQty;

      const createFillObject = {
        maker: restingOrder.userId,
        taker: order.userId,
        marketId: order.marketId,
        qty: tradeQty,
        price: bestPrice,
      };

      this.fillsManager.createFill(createFillObject);

      const existingPositionMaker = this.positionManager.getPosition(
        restingOrder.userId,
        order.marketId,
      );
      const existingPositionTaker = this.positionManager.getPosition(
        order.userId,
        order.marketId,
      );
      const takerMargin =
  (tradeQty * bestPrice) /
  order.leverage;

const makerMargin =
  (tradeQty * bestPrice) /
  restingOrder.leverage;

      const takerMaintainanceMargin =
        this.riskManager.calculateMaintainanceMargin(takerMargin);
      const makerMaintainanceMargin =
        this.riskManager.calculateMaintainanceMargin(makerMargin);
      const TakerLiquidationPrice = this.riskManager.calculateLiquidationMargin(
        order.price,
        order.leverage,
        order.positionType,
      );
      const MakerLiquidationPrice = this.riskManager.calculateLiquidationMargin(
        restingOrder.price,
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
        positionType: (order.positionType === "LONG" ? "SHORT" : "LONG") as PositionType,
        qty: tradeQty,
        leverage: restingOrder.leverage,
        margin: restingOrder.remainingQty*restingOrder.price,
        maintainanceMargin: makerMaintainanceMargin,
        liquidationPrice: MakerLiquidationPrice,
        pnL: 0,
        entryPrice: restingOrder.price,
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
  }
}

// makerPositions         exists           =>             => Yes   check side =>  update
// takerPositions         may/maynot exist => No ? Add    => Yes ? check side =>  update
// incommingPositions
