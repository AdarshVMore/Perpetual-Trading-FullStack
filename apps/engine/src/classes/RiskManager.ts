
import type {Order, User} from "@shared-types"
import prisma from "@prisma-db"
import { UserManager } from "./UserManager"
import type { OrderBook } from "./OrderBook"
import type { PositionType } from "@prisma-db"

export class RiskManager{

    private maintainanceMarginPercent = 5
    

    constructor(private userManager:UserManager, private orderBookManager:OrderBook){}

    calculateMargin(data:Order){
        let price = data.price;
        if (!price || data.marketType === "MARKET") {
            const book = this.orderBookManager.getBook(data.marketId);
            if (book) {
                const bestPrice = this.orderBookManager.getBestPrice(data.positionType, book);
                price = bestPrice ?? book.lastTradedPrice;
            }
            if (!price) {
                throw new Error("Price is required for margin calculation");
            }
        }
        return (price * data.qty) / data.leverage
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

    calculateLiquidationMargin(entryPrice:number, leverage:number, positionType:PositionType){
        let liquidationPrice = 0
        if(positionType === "LONG"){
            liquidationPrice = entryPrice*(1-(1/leverage)+(this.maintainanceMarginPercent/100))
        }
        else {
            liquidationPrice = entryPrice*(1+(1/leverage)-(this.maintainanceMarginPercent/100))
        }
        return liquidationPrice
    }
}
