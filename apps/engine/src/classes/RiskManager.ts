
import type {Order, User} from "@shared-types"
import prisma from "@prisma-db"
import { UserManager } from "./UserManager"
import type { OrderBook } from "./OrderBook"

export class RiskManager{

    private maintainanceMarginPercent = 5
    

    constructor(private userManager:UserManager, private orderBookManager:OrderBook){}

    calculateMargin(data:Order){
        let price
        if(data.marketType === "MARKET"){
            
        } else {
            price = data.price
        }
        return (data.price * data.qty) / data.leverage
    }

    validate(userId:string, margin:number){
        const user = this.userManager.getUser(userId)
        if(!user){
            throw new Error("user not found for validation in riskManager")
        }
        if(margin <= user.collateral.availabe){
            return true
        } else if(margin > user.collateral.availabe) {
            return false
        }
    }

    calculateMaintainanceMargin(margin:number){
        return (margin * this.maintainanceMarginPercent) / 100
    }

    calculateLiquidationMargin(){
        
    }
}