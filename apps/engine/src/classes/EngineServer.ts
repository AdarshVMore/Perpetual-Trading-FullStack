import type { FillManager } from "./FillManager";
import type { MatchingEngine } from "./MatchingEngine";
import { OrderBook } from "./OrderBook";
import type {Order} from "@shared-types"
import type { PositionManager } from "./PositionManager";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";

export class EngineServer {
  constructor(
    private orderBook: OrderBook,
    private matchingEngine: MatchingEngine,
    private userManager: UserManager,
    private positionManager: PositionManager,
    private riskManager: RiskManager,
    private fillManager: FillManager,
  ) {}

  public createOrder(data:any) {
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

    this.matchingEngine.matchOrder(data)
  }

  public cancleOrder(orderId: string) {}
}
