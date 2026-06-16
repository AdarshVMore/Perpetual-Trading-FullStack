import { UserManager } from "./UserManager";
import { PositionManager } from "./PositionManager";
import type { Order } from "@shared-types";
import type { EngineServer } from "./EngineServer";

export class LiquidationManager {
  constructor(
    private userManager: UserManager,
    private engineServe: EngineServer,
  ) {}

  start(marketId: string, indexPrice: number) {
    const users = this.userManager.userIds;
    for (let user of users) {
      let userData = this.userManager.getUser(user);
      if (!userData) {
        throw new Error("no user data exist for thisuserId in autoLiquidate");
      }
      for (let position of userData?.positions) {
        if (position.marketId === marketId) {
          if (
            indexPrice <= position.liquidationPrice &&
            position.positionType === "LONG"
          ) {
            const order = this.autoLiquiadte(user, marketId);
            this.engineServe.createOrder(order);
          }
          if (
            position.positionType === "SHORT" &&
            indexPrice >= position.liquidationPrice
          ) {
            const order = this.autoLiquiadte(user, marketId);
            this.engineServe.createOrder(order);
          }
        }
      }
    }
  }

  autoLiquiadte(userId: string, marketId: string) {
    let positions = this.userManager.getPositiotns(userId);
    if (!positions) {
      throw new Error("there no positions for user to autoLiquidate");
    }
    for (let position of positions) {
      if (position.marketId === marketId) {
        const order: Order = {
          orderId: Math.random().toString(),
          userId: userId,
          marketId: marketId,
          marketType: "MARKET",
          positionType: position.positionType,
          status: "OPEN",
          price: position.averagePrice,
          qty: position.qty,
          leverage: position.leverage,
          remainingQty: position.qty,
        };
        return order;
      }
    }
    return null;
  }
}
