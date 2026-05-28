import { OrderedMap, LinkList } from "js-sdsl";
import type { Order, User } from "@shared-types";

export class OrderBook {
  private orderBooks:Order|null = null;

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
