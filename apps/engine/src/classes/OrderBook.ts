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

      if(!data.price){
        throw new Error("price is not there in add Limit Order")
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
    const bestPrice =
      positionType === "LONG"
        ? orderBook.asks.front()?.[0]
        : orderBook.bids.back()?.[0];
    return bestPrice;
  }

  updateRemainingQty(data: Order, bestPrice: number) {
    const book = this.getBook(data.marketId);
    if(!book){
      throw new Error("book does not exist for updating emaining qty")
    }
    const side = data.positionType === "LONG" ? book.asks : book.bids;
    const iterator = side.find(bestPrice);
    const queue = iterator?.pointer[1];
    if (!queue) {
      throw new Error("there is no queue for this price");
    }
    const restingOrder = queue.front();
    if (!restingOrder) {
      throw new Error("there is no .front() in the queue");
    }
    const tradeQty = Math.min(data.qty, restingOrder?.remainingQty);
    data.remainingQty -= tradeQty;
    restingOrder.remainingQty -= tradeQty;
    if (restingOrder.remainingQty === 0) {
      queue.popFront();
      if(queue.size()=== 0){
        side.eraseElementByKey(bestPrice)
      }
    }
    
    return {tradeQty, restingOrder}
  }

  removeFilledOrder() {}

  addToBook(data: Order) {
    const book = this.orderBooks[data.marketId];
    const side = data.positionType === "LONG" ? book?.bids : book?.asks;
    const list = side?.find(data.price ? data.price : NaN);
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
      side.setElement(data.price ? data.price : NaN, newQueue);
    }
  }

  cancleOrder(order:Order) {
    const book = this.orderBooks[order.marketId]
    if (!book || !order.price) return

    const side = order.positionType === "LONG" ? book.bids : book.asks
    const list = side.find(order.price)
    if (!list?.equals(side?.end())) {
      const orderAtPrice = list?.pointer[1]
      if (!orderAtPrice) return
      for(let node = orderAtPrice?.begin(); !node?.equals(orderAtPrice?.end()); node = node?.next()){
        if(node?.pointer?.orderId === order.orderId){
          orderAtPrice.eraseElementByIterator(node)
          break
        }
      }
    }
  }

  getDepth(marketId: string, depth: number = 10) {
    const book = this.orderBooks[marketId];
    if (!book) return { asks: [] as [number, number][], bids: [] as [number, number][] };

    const asks: [number, number][] = [];
    const bids: [number, number][] = [];

    let it = book.asks.begin();
    let count = 0;
    while (!it.equals(book.asks.end()) && count < depth) {
      const price = it.pointer[0];
      const queue = it.pointer[1];
      let totalQty = 0;
      queue.forEach((order: Order) => { totalQty += order.remainingQty; });
      asks.push([price, totalQty]);
      it = it.next();
      count++;
    }

    const tempBids: [number, number][] = [];
    it = book.bids.begin();
    while (!it.equals(book.bids.end())) {
      const price = it.pointer[0];
      const queue = it.pointer[1];
      let totalQty = 0;
      queue.forEach((order: Order) => { totalQty += order.remainingQty; });
      tempBids.push([price, totalQty]);
      it = it.next();
    }
    for (let i = tempBids.length - 1; i >= 0 && bids.length < depth; i--) {
      const bid = tempBids[i];
      if (bid) bids.push(bid);
    }

    return { asks, bids };
  }
}
