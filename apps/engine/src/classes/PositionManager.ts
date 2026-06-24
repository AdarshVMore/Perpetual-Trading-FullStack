import type { dbPollerEvents, UserPositions } from "@shared-types";
import type { UserManager } from "./UserManager";
import { DBPoller } from "./DBPollerManager";
import type { RedisManager } from "./RedisManager";
import type { positionUpdates } from "@shared-types/src/ws/ws.types";

export class PositionManager {
  public allPositions: Map<string, UserPositions[]>; // marketId => positions
  private dbpoller?: DBPoller;
  constructor(
    private userManager: UserManager,
    private redisManager: RedisManager,
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
    let finalPosition: UserPositions | null = null;
    let isCancle = false;
    if (incommingPosition.positionType === existingPosition.positionType) {
      finalPosition = this.addPosition(incommingPosition, existingPosition);
    }
    if (incommingPosition.positionType != existingPosition.positionType) {
      if (incommingPosition.qty > existingPosition.qty) {
        finalPosition = this.reversePosition(
          incommingPosition,
          existingPosition,
          userId,
        );
      }
      if (incommingPosition.qty < existingPosition.qty) {
        finalPosition = this.reducePosition(
          incommingPosition,
          existingPosition,
          userId,
        );
      }
      if (incommingPosition.qty === existingPosition.qty) {
        finalPosition = this.canclePosition(
          incommingPosition,
          existingPosition,
          userId,
        );
        isCancle = true;
      }
    }

    if (!finalPosition) {
      throw new Error(
        "there is no final position to send to db poller in manipulatePositions",
      );
    }

    if (!this.dbpoller) {
      throw new Error(
        "there is no DBPoller to send data to in manipulatePositions",
      );
    }

    const createDBPollerPositionObject: dbPollerEvents = {
      type: "PositionUpdated",
      payload: {
        method: isCancle ? "DELETE" : "PUT",
        data: { userId: userId, position: finalPosition },
      },
    };
    this.dbpoller?.sendToDBPoller(createDBPollerPositionObject);
    this.publishPositionUpdate(userId, finalPosition);
  }

  newPosition(userId: string, position: UserPositions) {
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user does not exist to add position");
    }
    user.positions.push(position);
    this.publishPositionUpdate(userId, position);
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

    return existingPosition;
  }

  reducePosition(
    position: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ): UserPositions {
    let pnl: number;
    if (existingPosition.positionType === "LONG") {
      pnl =
        position.qty * (position.averagePrice - existingPosition.averagePrice);
    } else {
      pnl =
        position.qty * (existingPosition.averagePrice - position.averagePrice);
    }
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user not found in reduce Position");
    }
    const existingQty = existingPosition.qty;
    const unlockMargin =
      existingPosition.margin * (position.qty / existingQty);
    existingPosition.qty -= position.qty;
    existingPosition.pnL = pnl;
    existingPosition.realisedPnL += pnl;
    existingPosition.margin -= unlockMargin;
    user.collateral.availabe += pnl + unlockMargin;
    user.collateral.locked -= unlockMargin;

    return existingPosition;
  }

  canclePosition(
    position: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ): UserPositions {
    let PnL = 0;
    if (existingPosition.positionType === "LONG") {
      PnL = (position.averagePrice - existingPosition.averagePrice) * position.qty;
    } else if (existingPosition.positionType === "SHORT") {
      PnL = (existingPosition.averagePrice - position.averagePrice) * position.qty;
    }
    const user = this.userManager.getUser(userId);
    if (!user) {
      throw new Error("user not found in canclePosition");
    }
    existingPosition.realisedPnL += PnL;
    user.collateral.availabe =
      user.collateral.availabe + PnL + existingPosition.unrealisedPnL;
    user.collateral.locked = user.collateral.locked - existingPosition.margin;

    user.positions = user.positions.filter(
      (item) => item.marketId !== position.marketId,
    );

    return existingPosition;
  }

  reversePosition(
    position: UserPositions,
    existingPosition: UserPositions,
    userId: string,
  ): UserPositions {
    let PnL = 0;
    const user = this.userManager.getUser(userId);
    if (existingPosition.positionType === "LONG") {
      PnL =
        (position.averagePrice - existingPosition.averagePrice) * existingPosition.qty;
    } else if (existingPosition.positionType === "SHORT") {
      PnL =
        (existingPosition.averagePrice - position.averagePrice) * existingPosition.qty;
    }
    existingPosition.positionType = position.positionType;
    existingPosition.qty = position.qty - existingPosition.qty;
    existingPosition.averagePrice = position.averagePrice;
    existingPosition.margin = position.margin;
    existingPosition.pnL += PnL;
    existingPosition.realisedPnL += PnL;
    if (!user) {
      throw new Error("user not found in reverse Position");
    }
    user.collateral.availabe += PnL;
    return existingPosition;
  }

  public publishPositionUpdate(userId: string, position: UserPositions) {
    const channel = this.redisManager.createChannel(
      "position",
      position.marketId,
      userId,
    );
    const createPositionToPublish: positionUpdates = {
      type: "position",
      side: position.positionType,
      marketId: position.marketId,
      price: position.entryPrice,
      qty: position.qty,
      pnl: position.pnL,
      realisedPnL: position.realisedPnL,
    };

    void this.redisManager.publish(channel, createPositionToPublish);
  }
}
