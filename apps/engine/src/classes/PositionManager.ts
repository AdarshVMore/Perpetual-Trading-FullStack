import type { UserPositions } from "../../../../packages/shared-types";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";

export class PositionManager {
  constructor(
    private riskManager: RiskManager,
    private userManager: UserManager,
  ) {}

  getPosition(userId: string, marketId: string) {
    const positions = this.userManager.getPositiotns(userId);
    if (!positions) {
      throw new Error("positions not found");
    }
    for (let position of positions) {
      if (position.marketId === marketId) {
        return position;
      } else {
        return false;
      }
    }
  }

  addPosition(userId: string, position: UserPositions) {
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user does not exist to add position");
    }
    user.positions.push(position);
  }

  updatePosition(position: UserPositions, existingPosition: UserPositions) {
    const currentLiquidity =
      existingPosition.averagePrice * existingPosition.qty;
    const incommingLiquidity = position.averagePrice * position.qty;
    const totalQty = existingPosition.qty + position.qty;
    const totalAvgPrice = (currentLiquidity + incommingLiquidity) / totalQty;

    existingPosition.qty += position.qty;
    existingPosition.averagePrice = totalAvgPrice;
    existingPosition.unrealisedPnL = 0; // need to know how to calculate this
  }

  reducePosition(position: UserPositions, existingPosition: UserPositions) {}

  canclePosition(position: UserPositions, existingPosition: UserPositions) {}

  reversePosition(position: UserPositions, existingPosition: UserPositions) {}
}
