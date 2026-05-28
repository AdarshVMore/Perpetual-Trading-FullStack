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
    let bestPrice = this.getBestPrice(data.positionType, book);

    if (!bestPrice) {
      throw new Error("best ptice does not exits");
    }

    if (data.positionType === "LONG") {
      if (bestPrice <= data.price) {
        while (data.remainingQty <= 0) {
          this.updateRemainingQty(data, bestPrice);
        }
      } else {
      }
    } else {
    }
  }

  addMarketOrder(data: Order) {
    if (data.positionType === "LONG") {
    } else {
    }
  }

  getBestPrice(positionType: positionType, orderBook: SingleOrderBook) {
    if (positionType === "LONG") {
      return orderBook.asks.front()?.[0];
    } else {
      return orderBook.bids.back()?.[0];
    }
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
    return tradeQty;
  }

  removeFilledOrder() {}

  addToBook(data:Order){
    if(data.positionType === "LONG"){
      const book = this.orderBooks[data.marketId]
      const side = data.positionType === "LONG" ? book?.bids : book?.asks
      const list = side?.find(data.price)
      if(!side){
        throw new Error("side does not exists")
      }
      if(!list?.equals(side?.end())){
        const queue = list?.pointer[1]
        queue?.pushBack(data)
      } else {
        const newQueue = new LinkList<Order>
        newQueue.pushBack(data)
        this.orderBooks[data.marketId]?.bids.setElement(data.price, newQueue)
      }
    }
  }

  deleteOrder() {}
}
