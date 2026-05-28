
import type {Order, User} from "@shared-types"
import prisma from "@prisma-db"
import { UserManager } from "./UserManager"

export class RiskManager{

    private maintainanceMarginPercent = 5
    

    constructor(private userManager:UserManager){}

    calculateMargin(data:Order){
        console.log("data recieved in calculate margin as \n price = " , data.price , " \n qty = " , data.qty)
        return (data.price * data.qty) / data.leverage
    }

    validate(userId:string, margin:number){
        const user = this.userManager.getUser(userId)
        if(!user){
            throw new Error("user not found for validation in riskManager")
        }
        if(margin <= user.collateral.availabe){
            user.collateral.availabe -= margin
            user.collateral.locked += margin
            return true
        } else if(margin > user.collateral.availabe) {
            return false
        }

    }

    calculateLiquidationMargin(){
        
    }
}