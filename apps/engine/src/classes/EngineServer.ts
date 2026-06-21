import type { BackendEvents, CreateMarket, Order } from "@shared-types/src";
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
            if(!singleMessage.message.event){
              throw new Error("single message from redis stream is not available")
            }
            const payload:BackendEvents = JSON.parse(singleMessage.message.event) // i had an error here , i could have solved but i used GPT to solve it, just need to debug a little that had to do .event and the .parse it
            if(payload.type === "create-order") {
              this.createOrder(payload.data as Order);
            }
            else if(payload.type === "cancle-order") {
              this.cancleOrder(payload.data as Order)
            } else if(payload.type === "create-market"){
              this.createMarket(payload.data as CreateMarket)
            }
          }
        }
      }
    }
  }

  public createOrder(data:Order) {
    console.log("data recieved in the engine server", data)
    let user = this.userManager.getUser(data.userId)

    if(!user){
      console.log("adding new user")
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
