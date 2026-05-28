import type { User, UserPositions, UserOrders } from "@shared-types";

export class UserManager {
 
  constructor(public users: Map<string, User>) {
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
  }

  getUser(userId:string){
    console.log("current Users map is , ", this.users)
    return this.users.get(userId)
  }

  addOrder(userId:string) {
    // collateral validation
    // lock collateral
    // push order
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

  addPosition() {}
}
