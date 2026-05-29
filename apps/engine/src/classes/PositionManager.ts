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

  reducePosition(position: UserPositions, existingPosition: UserPositions, userId:string) {
    existingPosition.qty -= position.qty
    
    
  }

  canclePosition(position: UserPositions, existingPosition: UserPositions, userId:string) {
    let PnL = 0
    if(existingPosition.positionType === "LONG"){
        PnL = position.entryPrice - existingPosition.entryPrice
    } else if (existingPosition.positionType === "SHORT"){
        PnL = existingPosition.entryPrice - position.entryPrice
    }
    const user = this.userManager.getUser(userId)
    if(!user){
        throw new Error("user not found in canclePosition")
    }
    user.collateral.availabe = user.collateral.availabe + PnL + existingPosition.unrealisedPnL
    user.collateral.locked -= (existingPosition.averagePrice * existingPosition.qty)
    for (let singlePosition of user.positions){
        if(singlePosition.marketId === position.marketId){
            user.positions.filter(item => item != singlePosition)
            break
        }
    }
  }

  reversePosition(position: UserPositions, existingPosition: UserPositions, userId:string) {

    existingPosition.positionType = position.positionType
    existingPosition.qty = position.qty - existingPosition.qty
    existingPosition.averagePrice
  }
}
