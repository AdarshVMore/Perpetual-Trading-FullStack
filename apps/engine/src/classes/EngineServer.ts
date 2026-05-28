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
    const margin = this.riskManager.calculateMargin(data);
    console.log("margin calculated is ====> ", margin)
    const valid = this.riskManager.validate(data.userId);
  }

  public cancleOrder(orderId: string) {}
}
