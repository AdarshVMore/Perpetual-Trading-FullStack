import { OrderedMap, LinkList } from "js-sdsl";
import type {
  marketType,
  Order,
  OrderBooks,
  SingleOrderBook,
  User,
  positionType,
} from "@shared-types";

export class OrderBook {
  private orderBooks: OrderBooks = {};

  constructor() {
    this.initializeMarkets();
  }

  initializeMarkets() {
    const Markets = ["SOLUSDT", "ETHUSDT", "BTCUSDT"];

    for (let market of Markets) {
      this.orderBooks[market] = {
        asks: new OrderedMap<number, LinkList<Order>>(),
        bids: new OrderedMap<number, LinkList<Order>>(),
        lastTradedPrice: 90,
        indexPrice: 0,
      };
    }
  }

  getBook(marketId: string) {
    return this.orderBooks[marketId];
  }

  addLimitOrder(data: Order) {
    let book = this.orderBooks[data.marketId];
    if (!book) {
      throw new Error(`book with marketId ${data.marketId} does not exist`);
    }

    if (data.positionType === "LONG") {
      let bestPrice = this.getBestPrice(data.positionType, book);

      if (!bestPrice) {
        throw new Error("best ptice does not exits");
      }

      while (data.remainingQty <= 0 || bestPrice <= data.price) {
        bestPrice = this.getBestPrice(data.positionType, book);
        if (!bestPrice) {
          throw new Error("best ptice does not exits");
        }
        this.updateRemainingQty(data, bestPrice);
      }
      this.addToBook(data);
    } else {
    }
  }

  addMarketOrder(data: Order) {
    if (data.positionType === "LONG") {
    } else {
    }
  }

  getBestPrice(positionType: positionType, orderBook: SingleOrderBook) {
    const bestPrice = positionType === "LONG" ? orderBook.asks.front()?.[0] :  orderBook.bids.back()?.[0];
    return bestPrice
  }

  updateRemainingQty(data: Order, bestPrice: number) {
    const iterator = this.orderBooks[data.marketId]?.asks.find(bestPrice);
    const queue = iterator?.pointer[1];
    if (!queue) {
      throw new Error("there is no queue for this price");
    }
    const inQueueQty = queue.front();
    if (!inQueueQty) {
      throw new Error("there is no .front() in the queue");
    }
    const tradeQty = Math.min(data.qty, inQueueQty?.remainingQty);
    data.remainingQty -= tradeQty;
    inQueueQty.remainingQty -= tradeQty;
    if(inQueueQty.remainingQty === 0) {
      queue.empty()
      //  addFills => "Filled" makerId's Order Filled, takerId, orderId
      // 

    }
    // addFills => "partialFill" makerId, takerId, orderId
    // calculateSlippage => positions update in both Maker and Taker
    return tradeQty;
  }

  removeFilledOrder() {}

  addToBook(data: Order) {
    const book = this.orderBooks[data.marketId];
    const side = data.positionType === "LONG" ? book?.bids : book?.asks;
    const list = side?.find(data.price);
    if (!side) {
      throw new Error("side does not exists");
    }
    if (!list?.equals(side?.end())) {
      // it means as we get a pointer to a node in here like -> [101, list of orders] and end() is the end, so if list equals equal to end , then ! of list is not end is true
      const queue = list?.pointer[1];
      queue?.pushBack(data);
    } else {
      const newQueue = new LinkList<Order>();
      newQueue.pushBack(data);
      this.orderBooks[data.marketId]?.bids.setElement(data.price, newQueue);
    }
  }

  deleteOrder() {}
}
