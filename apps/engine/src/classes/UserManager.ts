import type { User, UserOrders, Order } from "@shared-types";
import db from "@prisma-db";
import type { DBPoller } from "./DBPollerManager";
import type { dbPollerEvents } from "@shared-types/src";

export class UserManager {

  private dbpoller?: DBPoller;

  constructor(public users: Map<string, User>, public userIds:string[]) {
  }

  setDBPoller(dbpoller: DBPoller) {
    this.dbpoller = dbpoller;
  }

  async addUser(userId: string) {
    let available = 1_000_000;
    let locked = 0;

    const balance = await db.userBalance.findUnique({ where: { userId } });
    if (balance) {
      available = balance.availableBalance;
      locked = balance.lockedBalance;
    }

    this.users.set(userId, {
      userId: userId,
      collateral: {
        availabe: available,
        locked: locked,
      },
      positions: [],
      orders: [],
    });
    this.userIds.push(userId);
  }

  getUser(userId:string){
    return this.users.get(userId)
  }

  addOrder(userId:string, order:UserOrders|Order) {
    const user = this.users.get(userId)
    if(!user) {
        throw new Error("user does not exist to add order")
    }
    user.orders.push(order as UserOrders)
  }

  removeOrder(userId: string, orderId: string) {
    const user = this.users.get(userId);
    if (!user) return;
    user.orders = user.orders.filter((o) => o.orderId !== orderId);
  }

  addBalance(user:User, balanceToAdd:number){
    user.collateral.availabe += balanceToAdd
    this.syncBalance(user);
  }

  lockBalance(user:User, margin:number){
    user.collateral.availabe -= margin
    user.collateral.locked += margin
    this.syncBalance(user);
  }

  unlockBalance(user: User, margin: number) {
    user.collateral.availabe += margin;
    user.collateral.locked -= margin;
    this.syncBalance(user);
  }

  syncBalance(user: User) {
    if (!this.dbpoller) return;
    const event: dbPollerEvents = {
      type: "BalanceUpdated",
      payload: {
        method: "PUT",
        data: {
          userId: user.userId,
          availableBalance: user.collateral.availabe,
          lockedBalance: user.collateral.locked,
        },
      },
    };
    void this.dbpoller.sendToDBPoller(event);
  }

  getPositiotns(userId:string){
    return this.users.get(userId)?.positions
  }
}
