import type { dbPollerEvents, UserPositions } from "@shared-types";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";
import { DBPoller } from "./DBPollerManager";

export class PositionManager {
  public allPositions: Map<string, UserPositions[]>; // marketId => positions
  private dbpoller?: DBPoller;
  constructor(
    private riskManager: RiskManager,
    private userManager: UserManager,
  ) {
    this.allPositions = new Map();
  }

  setDBPoller(dbpoller: DBPoller) {
    this.dbpoller = dbpoller;
  }

  getPosition(userId: string, marketId: string) {
    const positions = this.userManager.getPositiotns(userId);
    if (!positions) {
      throw new Error("positions not found");
    }
    for (let position of positions) {
      if (position.marketId === marketId) {
        return position;
      }
    }
    return null;
  }

  getAllPositions(marketId: string) {
    return this.allPositions.get(marketId);
  }

  manipulatePositions(
    incommingPosition: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ) {
    let finalPosition:UserPositions | null = null;
    let isCancle = false
    if (incommingPosition.positionType === existingPosition.positionType) {
      finalPosition = this.addPosition(incommingPosition, existingPosition);
    }
    if (incommingPosition.positionType != existingPosition.positionType) {
      if (incommingPosition.qty > existingPosition.qty) {
        finalPosition = this.reversePosition(incommingPosition, existingPosition, userId);
      }
      if (incommingPosition.qty < existingPosition.qty) {
        finalPosition = this.reducePosition(incommingPosition, existingPosition, userId);
      }
      if (incommingPosition.qty === existingPosition.qty) {
        finalPosition = this.canclePosition(incommingPosition, existingPosition, userId);
        isCancle = true
      }
    }

    if(!finalPosition){
      throw new Error("there is no final position to send to db poller in manipulatePositions")
    }
    
    if(!this.dbpoller){
      throw new Error("there is no DBPoller to send adta to in manipulatePositions")
    }

    const createDBPollerTakerPositionObject: dbPollerEvents = {
      type: "PositionUpdated",
      payload: {
        method: isCancle ? "DELETE" : "PUT",
        data: { userId: userId,  position: finalPosition },
      },
    };
    this.dbpoller?.sendToDBPoller(createDBPollerTakerPositionObject);
  }

  newPosition(userId: string, position: UserPositions) {
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user does not exist to add position");
    }
    user.positions.push(position);
  }

  addPosition(position: UserPositions, existingPosition: UserPositions) {
    const currentLiquidity =
      existingPosition.averagePrice * existingPosition.qty;
    const incommingLiquidity = position.averagePrice * position.qty;
    const totalQty = existingPosition.qty + position.qty;
    const totalAvgPrice = (currentLiquidity + incommingLiquidity) / totalQty;

    existingPosition.qty += position.qty;
    existingPosition.averagePrice = totalAvgPrice;
    existingPosition.margin += position.margin;

    return existingPosition
  }

  reducePosition(
    position: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ):UserPositions {
    let pnl =
      position.qty * (position.averagePrice - existingPosition.averagePrice);
    if (existingPosition.positionType === "LONG") {
      pnl =
        position.qty * (position.averagePrice - existingPosition.averagePrice);
    } else if (existingPosition.positionType === "SHORT") {
      pnl =
        position.qty * (existingPosition.averagePrice - position.averagePrice);
    }
    existingPosition.qty -= position.qty;
    existingPosition.pnL = pnl;
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user not found in reduce Position");
    }
    const unlockMargin =
      existingPosition.margin * (position.qty / existingPosition.qty); // i have doubt here, while reducing exting qty > incomming qty . so this (existingQty/incommingQty) is the correct way and not the way around
    existingPosition.margin -= unlockMargin;
    user.collateral.availabe += pnl + unlockMargin;
    user.collateral.locked -= unlockMargin;

    return existingPosition
  }

  canclePosition(
    position: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ):UserPositions {
    let PnL = 0;
    if (existingPosition.positionType === "LONG") {
      PnL = (position.entryPrice - existingPosition.entryPrice) * position.qty;
    } else if (existingPosition.positionType === "SHORT") {
      PnL = (existingPosition.entryPrice - position.entryPrice) * position.qty;
    }
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user not found in canclePosition");
    }
    user.collateral.availabe =
      user.collateral.availabe + PnL + existingPosition.unrealisedPnL;
    user.collateral.locked = user.collateral.locked - existingPosition.margin;

    for (let singlePosition of user.positions) {
      if (singlePosition.marketId === position.marketId) {
        user.positions = user.positions.filter(
          (item) => item != singlePosition,
        );
        break;
      }
    }

    return existingPosition
  }

  reversePosition(
    position: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ):UserPositions {
    let PnL = 0;
    const user = this.userManager.getUser(userId);
    if (existingPosition.positionType === "LONG") {
      PnL =
        (existingPosition.averagePrice - position.averagePrice) * position.qty;
    } else if (existingPosition.positionType === "SHORT") {
      PnL =
        (position.averagePrice - existingPosition.averagePrice) * position.qty;
    }
    existingPosition.positionType = position.positionType;
    existingPosition.qty = position.qty - existingPosition.qty;
    existingPosition.averagePrice = position.averagePrice;
    existingPosition.margin = position.margin;
    existingPosition.pnL += PnL;
    if (!user) {
      throw new Error("user not found in reverse Position");
    }
    user.collateral.availabe += PnL;
    return existingPosition
  }
}

// initial      10      @100       long            m=1000/lev      pnl=0
// incomming    13      @90        short           m=1070/lev      pnl=0
// final        3       @          short           m=              pnl=30
