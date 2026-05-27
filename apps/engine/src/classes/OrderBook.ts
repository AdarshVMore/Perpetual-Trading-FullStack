import { OrderedMap, LinkList } from "js-sdsl";
import type { Order, User } from "@shared-types";
import { orderBook } from "..";

export class OrderBook {
  private orderBooks;

  constructor(markets: string[]) {
    this.orderBooks = orderBook;
  }

  getBook(marketId:string){}

  addLimitOrder(data:Order){
    if(data.positionType === "LONG"){

    } else {

    }
  }

  addMarketOrder(data:Order){
    if(data.positionType === "LONG"){

    } else {
        
    }
  }

  getBestPrice(){}

  removeFilledOrder(){}

  deleteOrder(){}

}
