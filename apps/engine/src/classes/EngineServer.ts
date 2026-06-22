import type { CreateMarket, Order, marketType, orderStatus, positionType } from "@shared-types/src";
import type { MatchingEngine } from "./MatchingEngine";
import type { RedisManager } from "./RedisManager";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";
import type { OrderBook } from "./OrderBook";

export class EngineServer {
  constructor(
    private matchingEngine: MatchingEngine,
    private userManager: UserManager,
    private riskManager: RiskManager,
    private redisManager: RedisManager,
    private orderBook: OrderBook
  ) {}

  async start(){
     while (true) {
      const message = await this.redisManager.readFromBackendServer();
      if (message) {
        for (let stream of message) {
          for (let singleMessage of stream.messages) {
            const msg = singleMessage.message;
            if (msg.type === "create-order") {
              const order: Order = {
                orderId: msg.orderId ?? "",
                userId: msg.userId ?? "",
                marketId: msg.marketId ?? "",
                marketType: (msg.orderType ?? "LIMIT") as marketType,
                orderType: msg.orderType ?? "",
                positionType: (msg.positionType ?? "LONG") as positionType,
                status: (msg.status ?? "OPEN") as orderStatus,
                price: msg.price ? parseFloat(msg.price) : undefined,
                qty: msg.qty ? parseFloat(msg.qty) : 0,
                leverage: msg.leverage ? parseFloat(msg.leverage) : 1,
                remainingQty: msg.remainingQty ? parseFloat(msg.remainingQty) : 0,
              };
              this.createOrder(order);
            }
            else if(msg.type === "cancle-order") {
              const order: Order = {
                orderId: msg.orderId ?? "",
                userId: msg.userId ?? "",
                marketId: msg.marketId ?? "",
                marketType: "LIMIT",
                orderType: msg.orderType ?? "",
                positionType: (msg.positionType ?? "LONG") as positionType,
                status: "OPEN",
                price: msg.price ? parseFloat(msg.price) : undefined,
                qty: msg.qty ? parseFloat(msg.qty) : 0,
                leverage: msg.leverage ? parseFloat(msg.leverage) : 1,
                remainingQty: 0,
              };
              this.cancleOrder(order)
            } else if(msg.type === "create-market"){
              const createMarket: CreateMarket = {
                marketName: msg.marketName ?? "",
                marketId: msg.marketId ?? "",
                maxLeverage: msg.maxLeverage ?? "10",
                symbol: msg.symbol ?? "",
              };
              this.createMarket(createMarket)
            }
          }
        }
      }
    }
  }

  public createOrder(data:Order) {
    let user = this.userManager.getUser(data.userId)

    if(!user){
      this.userManager.addUser(data.userId)
      user = this.userManager.getUser(data.userId)
    }

    const margin = this.riskManager.calculateMargin(data);
    
    const valid = this.riskManager.validate(data.userId, margin);

    if(!user) {
      throw new Error("user not found")
    }
        
    if(valid) {
      this.userManager.lockBalance(user, margin)
      this.userManager.addOrder(data.userId, data)
    }

    const response = this.matchingEngine.matchOrder(data)
  }

  public cancleOrder(data: Order) {
    this.orderBook.cancleOrder(data)
  }

  public createMarket(data: CreateMarket) {}
}
