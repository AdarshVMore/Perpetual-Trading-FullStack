
import type {Order} from "@shared-types"

export class RiskManager{

    private maintainanceMarginPercent = 5

    calculateMargin(data:Order){
        return (data.price * data.qty) / data.leverage
    }

    validate(userId:string){

    }

    calculateLiquidationMargin(){
        
    }
}