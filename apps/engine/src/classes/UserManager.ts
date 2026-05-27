import type { User } from "@shared-types"

export class UserManager{
    private users = new Map()
    constructor(users: User[]){
        // this.users = users
    }

    addOrder(){
        // collateral validation
        // lock collateral
        // push order
    }

    updateOrder(){
        // remainingQty -= tradedQty
        // filledQty += tradedQty
    }

    updateBalance(){

    }

    addPosition(){
        
    }
}