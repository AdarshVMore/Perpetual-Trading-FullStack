import type { Order } from "@shared-types";
import type { FillManager } from "./FillManager";
import type { OrderBook } from "./OrderBook";
import type { LinkList } from "js-sdsl";
import type { PositionManager } from "./PositionManager";
import type { RiskManager } from "./RiskManager";

export class MatchingEngine {
  constructor(
    private orderBook: OrderBook,
    private fillsManager: FillManager,
    private positionManager: PositionManager,
    private riskManager: RiskManager
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

      const existingPositionMaker = this.positionManager.getPosition(restingOrder.userId, order.marketId)
      const existingPositionTaker = this.positionManager.getPosition(order.userId, order.marketId)
      const margin = this.riskManager.calculateMargin(order)
      const maintainanceMargin = this.riskManager.calculateMaintainanceMargin(margin)
      const liquidationPrice = this.riskManager.calculateLiquidationMargin()
      const pnl = 0
      const averagePrice = 0

      if(!existingPositionTaker){
        let position = {
          marketId: restingOrder.userId,
            positionType: order.positionType,
            qty: tradeQty,
            leverage: order.leverage,
            margin: margin,
            maintainanceMargin: maintainanceMargin,
            liquidationPrice: liquidationPrice,
            pnL: pnl,
            averagePrice: averagePrice,
            unrealisedPnL: 0,
        }
        this.positionManager.addPosition(order.userId, position)
      }
    }
  }
}
