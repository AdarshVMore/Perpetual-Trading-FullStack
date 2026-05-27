import type { Order } from "@shared-types";
import {OrderBook} from "./OrderBook"
import { MatchingEngine } from "./MatchingEngine";
import { UserManager } from "./UserManager";
import { PositionManager } from "./PositionManager";
import { RiskManager } from "./RiskManager";
import { FillManager } from "./FillManager";

export class EngineServer {
  private orderBook;
  private matchingEngine;
  private userManager;
  private positionManager;
  private riskManager;
  private fillManager;

  constructor(){
    this.orderBook = OrderBook
    this.matchingEngine = MatchingEngine
    this.userManager = UserManager
    this.positionManager = PositionManager
    this.riskManager = RiskManager
    this.fillManager = FillManager
  }

  createOrder(data:any){
    const margin = this.riskManager.calculateMargin()
    const valid = this.riskManager.validate()


    if (valid) {
        this.userManager.addOrder()
        const result = this.matchingEngine.matchOrder()
        if(result.remainingQty > 0) {
            this.orderBook.addOrder()
        }
        this.positionManager.update()
    }
  }

  cancleOrder(orderId:string){
    // remove from orderbook
    // refund collateral
    // update order status
  }
}
