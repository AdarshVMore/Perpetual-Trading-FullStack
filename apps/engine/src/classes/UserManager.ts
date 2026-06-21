import type { User, UserPositions, UserOrders, Order } from "@shared-types";
import { string } from "zod";

export class UserManager {
 
  constructor(public users: Map<string, User>, public userIds:string[]) {
  }

  addUser(userId: string) {
    this.users.set(userId, {
      userId: userId,
      collateral: {
        availabe: 0,
        locked: 0,
      },
      positions: [],
      orders: [],
    });
    this.userIds.push(userId)
  }

  getUser(userId:string){
    console.log("current Users map is , ", this.users)
    return this.users.get(userId)
  }

  addOrder(userId:string, order:UserOrders|Order) {
    const user = this.users.get(userId)
    if(!user) {
        throw new Error("user does not exist to add order")
    }
    user.orders.push(order as UserOrders)
  }

  updateOrder() {
    // remainingQty -= tradedQty
    // filledQty += tradedQty
  }

  addBalance(user:User, balanceToAdd:number){
    user.collateral.availabe += balanceToAdd
    console.log("added balance")
  }

  lockBalance(user:User, margin:number){
    user.collateral.availabe -= margin
    user.collateral.locked += margin
    console.log("locked Balance")
  }

  updateBalance() {}

  getPositiotns(userId:string){
    return this.users.get(userId)?.positions
  }
}
